// Ingestion CLI.
//
//   npm run ingest -- --source all
//   npm run ingest -- --source remotive --dry-run
//   npm run ingest -- --source remoteok --force
//
// --dry-run   fetch, validate, classify and compare with the database, but write nothing.
//             Still calls the source API, so it obeys the same rate limit.
// --force     ignore a source's minimum interval between runs (Remotive: 6 hours).
//
// Environment: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY, from .env.local when present
// (the npm script passes Node's --env-file-if-exists), otherwise from the environment (CI).
// Exit code 1 when any source fails.
import { parseArgs } from "node:util";

import { emptyCounts } from "@/lib/ingestion/db";

import {
  ADAPTER_IDS,
  adapters,
  type AdapterId,
} from "@/lib/ingestion/adapters";
import {
  runSource,
  type PipelineDeps,
  type RunOptions,
  type RunOutcome,
} from "@/lib/ingestion/pipeline";
import { createAdminClient } from "@/lib/supabase/admin";

function parseSources(value: string): AdapterId[] {
  if (value === "all") return [...ADAPTER_IDS];
  const id = ADAPTER_IDS.find((candidate) => candidate === value);
  if (!id)
    throw new Error(
      `Unknown --source "${value}". Use one of: all, ${ADAPTER_IDS.join(", ")}`,
    );
  return [id];
}

/** Dispatches by id. A switch keeps each adapter's item type intact for runSource's generic. */
function run(
  id: AdapterId,
  deps: PipelineDeps,
  options: RunOptions,
): Promise<RunOutcome> {
  switch (id) {
    case "remotive":
      return runSource(adapters.remotive, deps, options);
    case "remoteok":
      return runSource(adapters.remoteok, deps, options);
  }
}

function printOutcome(outcome: RunOutcome, dryRun: boolean): void {
  if (outcome.status === "skipped") {
    console.log(`\n${outcome.sourceId}: SKIPPED. ${outcome.reason}`);
    return;
  }
  const c = outcome.counts;
  const verb = dryRun ? "would be " : "";
  console.log(
    `\n${outcome.sourceId}: ${outcome.status.toUpperCase()}${dryRun ? " (dry run, nothing written)" : ""}`,
  );
  console.table({
    fetched: c.fetched,
    "schema-invalid": c.invalid,
    "not tech (filtered)": c.notTech,
    "not remote-US (filtered)": c.notRemoteUs,
    "stale (past max age)": c.stale,
    "remote-US eligible": c.eligible,
    [`${verb}inserted`]: c.inserted,
    [`${verb}updated`]: c.updated,
    [`${verb}unchanged (last_seen_at only)`]: c.unchanged,
    [`${verb}reopened`]: c.reopened,
    [`${verb}closed`]: c.closed,
  });
  for (const warning of outcome.warnings) console.log(`  warning: ${warning}`);
  if (outcome.error) console.log(`  error: ${outcome.error}`);
  if (outcome.sample?.length) {
    console.log("  sample rows:");
    for (const row of outcome.sample) {
      console.log(
        `  - ${row.title} @ ${row.company_name} [${row.remote_region}] ${row.location_raw ?? "(no location)"}`,
      );
      console.log(`    ${row.source_url ?? row.apply_url}`);
    }
  }
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      source: { type: "string", default: "all" },
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
    },
    strict: true,
  });

  const sources = parseSources(values.source);
  const options: RunOptions = {
    dryRun: values["dry-run"],
    force: values.force,
  };
  const deps: PipelineDeps = {
    db: createAdminClient(),
    log: (message) => console.log(message),
  };

  let failed = false;
  // One source at a time: each is a single request, and a failure in one does not stop the next.
  for (const id of sources) {
    console.log(`\nIngesting ${id}${options.dryRun ? " (dry run)" : ""}...`);
    let outcome: RunOutcome;
    try {
      outcome = await run(id, deps, options);
    } catch (error) {
      // runSource records fetch/process failures on the run row itself. This catches the
      // database calls made before that row exists (the rate-limit check, creating the row),
      // so one source's database error does not stop the next source.
      outcome = {
        status: "failed",
        sourceId: id,
        counts: emptyCounts(),
        warnings: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
    printOutcome(outcome, options.dryRun);
    if (outcome.status === "failed") failed = true;
  }
  return failed ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
