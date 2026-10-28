// Close selection: which open jobs in a scope should be marked closed after a fetch.
//
// Pure: no database, no clock (now comes in through the policy). The pipeline loads the open
// jobs and closes the returned ids. See docs/decisions/0008-dedupe-and-closing-strategy.md.

/** One open job in the scope being reconciled. */
export interface OpenJob {
  id: number;
  externalId: string;
  /** The source's posting date (ISO 8601), or null when the source gave none. */
  postedAt: string | null;
  /** When ingestion first saw the job (ISO 8601). Never null. */
  firstSeenAt: string;
}

/**
 * What the fetch for this scope returned.
 * presentExternalIds: the external ids of jobs that passed every filter in this run.
 */
export type FetchResult =
  | { ok: false }
  | { ok: true; fetchedCount: number; presentExternalIds: ReadonlySet<string> };

/** Circuit breaker settings, shared by both strategies. */
export interface CircuitBreaker {
  /** fetched_count of the previous successful run for this scope; null if there was none. */
  previousFetchedCount: number | null;
  /** Skip closing when fetchedCount < previousFetchedCount * minRatio. 0.5 in production. */
  minRatio: number;
}

export type ClosePolicy = CircuitBreaker &
  (
    | { kind: "snapshot" }
    | {
        kind: "max_age";
        maxAgeDays: number;
        now: Date;
      }
  );

export interface CloseDecision {
  idsToClose: number[];
  /** Why nothing was closed when a safety rule stopped it; null when the strategy ran. */
  skippedReason: string | null;
}

/**
 * Returns the ids of open jobs to close for one scope.
 *
 * "Scope" is whatever openJobs contains. Today the pipeline passes all open jobs of one source;
 * Layer 3b passes one company board's jobs. The function does not know or care which.
 *
 * Strategies:
 * - snapshot: the source returns every active job (ATS boards, Layer 3b). An open job whose
 *   externalId is not in presentExternalIds is closed; a present one is not.
 * - max_age: the source returns only a recent window (Remotive, Remote OK). Absence proves
 *   nothing, so presence is ignored. A job is closed when it is older than maxAgeDays at `now`,
 *   using postedAt, or firstSeenAt when postedAt is null.
 *
 * Safety rules, checked first, for both strategies. Each returns no ids and a skippedReason:
 * - The fetch failed (ok: false).
 * - The fetch returned 0 items. An empty response is far more likely an outage or a format
 *   change than every job disappearing at once.
 * - Circuit breaker: fetchedCount < previousFetchedCount * minRatio. Not applied when
 *   previousFetchedCount is null (first run). A drop to exactly the ratio is allowed.
 *
 * Known trade-off (snapshot): presentExternalIds only contains jobs that passed every filter,
 * so a job that becomes schema-invalid for one run is closed, and reopened by the upsert when
 * it is valid again.
 *
 * Study guide: docs/study/closing-strategy.md
 */
export function selectJobsToClose(
  openJobs: readonly OpenJob[],
  fetchResult: FetchResult,
  policy: ClosePolicy,
): CloseDecision {
  // ---- Safety rules: decide whether closing is allowed at all --------------------------------
  // Each one returns early with no ids. They run before either strategy, because a bad fetch
  // makes both strategies unreliable: snapshot would read "missing" as "closed", and an
  // age-based run on a broken feed is a sign something upstream changed.

  // 1. The fetch failed. Narrowing on `ok` also tells TypeScript that fetchedCount and
  //    presentExternalIds exist below this line.
  if (!fetchResult.ok) {
    return skip("the fetch failed");
  }

  // 2. Zero items. Every job vanishing at once is far less likely than an outage or an API change.
  if (fetchResult.fetchedCount === 0) {
    return skip("the fetch returned 0 items");
  }

  // 3. Circuit breaker: a sharp drop against the previous successful run. Skipped on the first
  //    run (no baseline). Strict "<", so a drop to exactly the ratio (10 -> 5 at 0.5) is allowed.
  const { previousFetchedCount, minRatio } = policy;
  if (
    previousFetchedCount !== null &&
    fetchResult.fetchedCount < previousFetchedCount * minRatio
  ) {
    return skip(
      `fetched ${fetchResult.fetchedCount} items, under ${minRatio * 100}% of the previous ` +
        `successful run's ${previousFetchedCount}`,
    );
  }

  // ---- Strategies: which jobs to close ---------------------------------------------------------
  // `policy.kind` is a discriminant: inside each branch TypeScript knows which fields exist
  // (maxAgeDays and now only on max_age).

  if (policy.kind === "snapshot") {
    // The feed lists every active job, so "not in this fetch" means "taken down".
    const { presentExternalIds } = fetchResult;
    return ran(
      openJobs.filter((job) => !presentExternalIds.has(job.externalId)),
    );
  }

  // max_age: the feed is only a recent window, so absence proves nothing and presence is
  // ignored. Close a job once its age is STRICTLY greater than maxAgeDays. The pipeline's stale
  // filter uses the same boundary, so the two never disagree about a job exactly on the line.
  const cutoffMs = policy.now.getTime() - policy.maxAgeDays * DAY_MS;
  return ran(
    openJobs.filter((job) => {
      // postedAt is the source's date; firstSeenAt (never null) is ours, used when it is missing.
      const ageFromMs = Date.parse(job.postedAt ?? job.firstSeenAt);
      // An unparseable date gives NaN, and NaN < anything is false: such a job is kept open.
      // Closing on bad data is the riskier mistake.
      return ageFromMs < cutoffMs;
    }),
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** A safety rule stopped the close step: nothing is closed, and the reason is logged on the run. */
function skip(reason: string): CloseDecision {
  return { idsToClose: [], skippedReason: reason };
}

/** The strategy ran. Returns database ids (what the UPDATE needs), not external ids. */
function ran(jobsToClose: readonly OpenJob[]): CloseDecision {
  return { idsToClose: jobsToClose.map((job) => job.id), skippedReason: null };
}
