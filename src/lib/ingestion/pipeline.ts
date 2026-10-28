// Runs one source end to end:
//   rate-limit check -> ingestion_runs row (running) -> fetch -> validate -> normalize ->
//   tech filter -> remote-US filter -> stale filter -> dedupe key + hash -> upsert -> close
//   -> ingestion_runs row (succeeded | failed, with counts).
//
// Every dependency (database client, fetch, clock, classifiers, logger) is passed in, so the
// pure part (processItems) is unit tested without a database or network, and the database part
// is integration tested against the local stack.
import { z } from "zod";

import type { AdminClient } from "@/lib/supabase/admin";

import { classifyRemoteUS } from "./classify/remote-us";
import { isTechRole } from "./classify/tech";
import {
  closeJobs,
  createRun,
  emptyCounts,
  finishRun,
  lastRunStartedAt,
  lastSucceededRun,
  loadOpenJobs,
  type RunCounts,
} from "./db";
import { computeDedupeKey } from "./dedupe";
import { contentHash } from "./hash";
import type { FetchImpl } from "./http";
import { selectJobsToClose, type ClosePolicy } from "./reconcile";
import type { JobRow, SourceAdapter } from "./types";
import { upsertJobs } from "./upsert";

/** Circuit breaker: skip closing when a fetch returns under half the previous run's items. */
export const CIRCUIT_BREAKER_MIN_RATIO = 0.5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** At most this many invalid-item details are logged per run; the count is always exact. */
const MAX_LOGGED_INVALID = 5;

export interface Classifiers {
  isTechRole: typeof isTechRole;
  classifyRemoteUS: typeof classifyRemoteUS;
  computeDedupeKey: typeof computeDedupeKey;
}

const defaultClassifiers: Classifiers = {
  isTechRole,
  classifyRemoteUS,
  computeDedupeKey,
};

export interface ProcessResult {
  rows: JobRow[];
  counts: Pick<
    RunCounts,
    "fetched" | "invalid" | "notTech" | "notRemoteUs" | "stale" | "eligible"
  >;
  warnings: string[];
}

/**
 * The pure middle of the pipeline: raw items in, rows to write out, with a count for every item
 * dropped and why. fetched = invalid + notTech + notRemoteUs + stale + eligible, except that a
 * repeated external_id is dropped with a warning and is in none of the buckets.
 */
export function processItems<Item>(
  adapter: SourceAdapter<Item>,
  items: readonly unknown[],
  options: {
    now: Date;
    classifiers?: Classifiers;
    log?: (message: string) => void;
  },
): ProcessResult {
  const classifiers = options.classifiers ?? defaultClassifiers;
  const log = options.log ?? (() => {});
  const counts: ProcessResult["counts"] = {
    fetched: items.length,
    invalid: 0,
    notTech: 0,
    notRemoteUs: 0,
    stale: 0,
    eligible: 0,
  };
  const warnings: string[] = [];
  const rows: JobRow[] = [];
  const seenIds = new Set<string>();
  const maxAgeMs =
    adapter.closeStrategy.kind === "max_age"
      ? adapter.closeStrategy.maxAgeDays * DAY_MS
      : null;

  for (const [index, item] of items.entries()) {
    const parsed = adapter.itemSchema.safeParse(item);
    if (!parsed.success) {
      counts.invalid++;
      if (counts.invalid <= MAX_LOGGED_INVALID) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
        log(`  [${adapter.id}] item ${index} invalid: ${issues}`);
      }
      continue;
    }

    const { source_remote_flag: sourceRemoteFlag, ...job } = adapter.normalize(
      parsed.data,
    );

    if (seenIds.has(job.external_id)) {
      // Two rows with the same key in one upsert would fail the batch
      // ("ON CONFLICT DO UPDATE command cannot affect row a second time").
      warnings.push(
        `duplicate external_id ${job.external_id} in feed; kept the first`,
      );
      continue;
    }
    seenIds.add(job.external_id);

    if (!classifiers.isTechRole(job.title)) {
      counts.notTech++;
      continue;
    }

    const remote = classifiers.classifyRemoteUS({
      locationRaw: job.location_raw,
      sourceRemoteFlag,
      tags: job.tags,
    });
    if (!remote.eligible || remote.remoteRegion === "non_us") {
      counts.notRemoteUs++;
      continue;
    }

    // An age-based source can still list jobs older than its max age. Upserting one would
    // reopen it and the close step would close it again, on every run.
    if (
      maxAgeMs !== null &&
      job.posted_at &&
      options.now.getTime() - Date.parse(job.posted_at) > maxAgeMs
    ) {
      counts.stale++;
      continue;
    }

    const withDerived = {
      ...job,
      is_remote: remote.isRemote,
      remote_region: remote.remoteRegion,
      dedupe_key: classifiers.computeDedupeKey(job.company_name, job.title),
    };
    rows.push({
      ...withDerived,
      content_hash: contentHash(withDerived),
      // The original item, not parsed.data: validation strips keys the schema does not list,
      // and raw exists to keep everything for re-normalizing later (decision 0006). The item
      // came from response.json(), so this check cannot fail; it proves the type without a cast.
      raw: jsonSchema.parse(item),
    });
    counts.eligible++;
  }

  return { rows, counts, warnings };
}

const jsonSchema = z.json();

export interface PipelineDeps {
  db: AdminClient;
  fetchImpl?: FetchImpl;
  now?: () => Date;
  log?: (message: string) => void;
  classifiers?: Classifiers;
}

export interface RunOptions {
  dryRun: boolean;
  /** Ignore the adapter's minimum interval between runs. */
  force: boolean;
}

export type RunOutcome =
  | { status: "skipped"; sourceId: string; reason: string }
  | {
      status: "succeeded" | "failed";
      sourceId: string;
      counts: RunCounts;
      warnings: string[];
      error?: string;
      /** Dry run only: a few of the rows that would be written. */
      sample?: JobRow[];
    };

export async function runSource<Item>(
  adapter: SourceAdapter<Item>,
  deps: PipelineDeps,
  options: RunOptions,
): Promise<RunOutcome> {
  const { db } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? (() => {});

  // The circuit breaker's baseline: only a successful run's count is trustworthy.
  const previous = await lastSucceededRun(db, adapter.id);

  // The rate limit counts ANY recorded run, failed ones too: a failed run still called the API,
  // and a source that keeps failing must not be hit on every schedule. (Dry runs record no row,
  // so they are not counted; run them sparingly against rate-limited sources.)
  if (adapter.minIntervalMs !== undefined && !options.force) {
    const lastStartedAt = await lastRunStartedAt(db, adapter.id);
    const elapsed = lastStartedAt
      ? now.getTime() - lastStartedAt.getTime()
      : Infinity;
    if (elapsed < adapter.minIntervalMs) {
      const hours = (elapsed / 3_600_000).toFixed(1);
      const limit = adapter.minIntervalMs / 3_600_000;
      return {
        status: "skipped",
        sourceId: adapter.id,
        reason: `last run was ${hours} h ago; this source allows one run per ${limit} h (use --force to override)`,
      };
    }
  }

  const runId = options.dryRun ? null : await createRun(db, adapter.id);
  const counts = emptyCounts();
  const warnings: string[] = [];

  try {
    const items = await adapter.fetchJobs({ fetchImpl: deps.fetchImpl });
    // Recorded before processing, so a run that fails later still shows the fetch worked.
    counts.fetched = items.length;
    const processed = processItems(adapter, items, {
      now,
      classifiers: deps.classifiers,
      log,
    });
    Object.assign(counts, processed.counts);
    warnings.push(...processed.warnings);

    const upserted = await upsertJobs(db, adapter.id, processed.rows, {
      now,
      dryRun: options.dryRun,
    });
    Object.assign(counts, upserted);

    const policy: ClosePolicy = {
      ...(adapter.closeStrategy.kind === "max_age"
        ? { kind: "max_age", maxAgeDays: adapter.closeStrategy.maxAgeDays, now }
        : { kind: "snapshot" }),
      previousFetchedCount: previous?.fetchedCount ?? null,
      minRatio: CIRCUIT_BREAKER_MIN_RATIO,
    };
    // In a dry run nothing was upserted, so this is the open set before the run: close as-if.
    const openJobs = await loadOpenJobs(db, adapter.id);
    const decision = selectJobsToClose(
      openJobs,
      {
        ok: true,
        fetchedCount: items.length,
        presentExternalIds: new Set(processed.rows.map((r) => r.external_id)),
      },
      policy,
    );
    if (decision.skippedReason) {
      warnings.push(`close step skipped: ${decision.skippedReason}`);
    }
    counts.closed = options.dryRun
      ? decision.idsToClose.length
      : await closeJobs(db, decision.idsToClose, now);

    for (const warning of warnings)
      log(`  [${adapter.id}] warning: ${warning}`);
    if (runId !== null)
      await finishRun(db, runId, { status: "succeeded", counts, warnings });

    return {
      status: "succeeded",
      sourceId: adapter.id,
      counts,
      warnings,
      sample: options.dryRun ? processed.rows.slice(0, 3) : undefined,
    };
  } catch (error) {
    // A failed fetch never reaches the close step, so a failure can never close jobs.
    const message = error instanceof Error ? error.message : String(error);
    if (runId !== null) {
      try {
        await finishRun(db, runId, {
          status: "failed",
          counts,
          warnings,
          error: message,
        });
      } catch (finishError) {
        log(
          `  [${adapter.id}] could not record the failure: ${String(finishError)}`,
        );
      }
    }
    return {
      status: "failed",
      sourceId: adapter.id,
      counts,
      warnings,
      error: message,
    };
  }
}
