# 0008: De-duplication and closing strategy

- Status: Accepted
- Layer: 3
- Date: 2026-10-28

## Context

The same job can arrive from more than one source, spelled differently. Jobs that are no longer listed must be closed (and later deleted, Layer 3b) to keep the database to a few thousand current jobs. But sources differ in what "missing from the feed" means: some return every active job, others only a recent window. A closing rule that is wrong for its source would either close live jobs or keep dead ones, and a broken fetch must never close anything.

When fetched on 2026-10-14, Remotive's free API returned only its 15 most recent jobs and ignored the `category` parameter. Remote OK returned 100 jobs, about 10 weeks deep.

## Decision

**De-duplication key.** `computeDedupeKey(companyName, title)` (`dedupe.ts`) returns `"<company>|<title>"`, both normalized: accents, case and punctuation removed; trailing legal suffixes (inc, llc, ltd, corp, co) dropped from the company; `" - ..."` and `(...)` qualifiers cut from the title; `sr`/`jr` spelled out. It is stored in the indexed, non-unique `dedupe_key` column (decision 0006). Layer 3a stores it; Layer 3b groups by it.

**Two closing strategies,** chosen per source, in the pure function `selectJobsToClose` (`reconcile.ts`):

- **snapshot**, for sources that return every active job (the ATS boards in Layer 3b): an open job missing from a successful fetch is closed.
- **max_age**, for sources that return a window: a job is closed when its `posted_at` (or `first_seen_at` if missing) is older than the max age, default 30 days, whether or not it is still in the feed. A job is never closed for being missing.

Both aggregators use **max_age**. Remote OK was planned that way. Remotive was planned as snapshot, on the assumption that it returns all active jobs; the 15-job window disproved that, and the owner chose max_age, because snapshot would close live Remotive jobs as soon as newer ones pushed them out of the window.

**Safety rules before either strategy** (circuit breaker). Nothing is closed when the fetch failed, when it returned 0 items, or when it returned fewer than 50% of the previous successful run's items. The skip reason is recorded in `ingestion_runs.warnings`.

**Stale filter.** For max_age sources, items already past the max age are dropped before the upsert (`ingestion_runs.stale_count`). Otherwise a 35-day-old job still in the feed would be reopened by the upsert and closed again by the same run, every run. The stale filter and `selectJobsToClose` use the same boundary: only strictly older than the max age.

**Scope.** `selectJobsToClose` closes from whatever list of open jobs it is given, so Layer 3b can pass one company board's jobs instead of a whole source without changing it.

**Attribution (for Layer 6).** Remotive and Remote OK job pages must show the source name and a followed link (no `rel="nofollow"`) to `source_url`, as their API terms require.

## Alternatives considered

- **Snapshot for Remotive, as first planned.** Rejected after the real fetch showed a 15-job window.
- **Window-aware snapshot** (close a missing job only if it was posted after the oldest item in this fetch). Catches early removals, but adds a third strategy; age-based is simpler and safe.
- **Closing on `last_seen_at`** (not seen for N days). Works for both kinds of source, but a source that is down for N days would close everything; age-based closing does not depend on fetch success.
- **No circuit breaker.** One empty or truncated response from a source would close every job from it.
- **Fuzzy matching for duplicates** (edit distance, trigram similarity). Needs a threshold and pairwise comparison, and produces no key to index or explain.
- **Location in the dedupe key.** Location strings are the least consistent field across feeds, so it would split real duplicates.

## Consequences

- A filled job on Remotive or Remote OK can stay open for up to 30 days. Acceptable for a personal job search; a 404 from the employer is the user's signal.
- If a source stays broken, the circuit breaker keeps closing paused, and its old jobs stay open until it recovers. The warnings column makes this visible.
- The first real run found two cross-source duplicates (`lemonio|senior react full stack developer`, `askable|software engineer ai coding tasks`). Layer 3b decides which copy to show.
- Changing the dedupe rules needs no backfill: `dedupe_key` is part of `content_hash`, so affected rows are rewritten on their next run.

## Interview talking points

- "Missing from the feed means different things per source, so closing is a per-source strategy: snapshot for complete feeds, age-based for windowed ones."
- "I planned snapshot for Remotive, then the first real fetch showed only 15 jobs, so I switched it to age-based before it could close live jobs."
- "A circuit breaker stops closing when a fetch fails, is empty, or drops below half the previous run, because an outage looks exactly like every job disappearing."
- "Stale items are filtered before the upsert with the same boundary as the close rule, or the two would fight and flip a job open and closed every run."
- "The dedupe key is a deterministic, readable string in a non-unique index: a bad match only groups two rows, it never blocks an insert."
