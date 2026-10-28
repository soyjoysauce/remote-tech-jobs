# Study guide: closing jobs safely

Code: [`src/lib/ingestion/reconcile.ts`](../../src/lib/ingestion/reconcile.ts) (`selectJobsToClose`), plus the glue in [`pipeline.ts`](../../src/lib/ingestion/pipeline.ts) and [`db.ts`](../../src/lib/ingestion/db.ts) (`closeJobs`)
Tests: [`src/lib/ingestion/reconcile.test.ts`](../../src/lib/ingestion/reconcile.test.ts)
Decision: [0008 de-duplication and closing strategy](../decisions/0008-dedupe-and-closing-strategy.md)

## 1. The problem in one paragraph

The database should hold only current jobs. When a job is filled, it disappears from its source, so ingestion has to mark it `closed` (and Layer 3b deletes it later). The hard part is deciding **when a missing job is really gone**. Some feeds return every active job, so missing means gone. Others return only the newest few, so missing means nothing. And an outage looks exactly like every job disappearing at once. Closing wrongly hides live jobs from the user. `selectJobsToClose` decides which open jobs to close after each fetch, and refuses to close anything when the fetch looks untrustworthy.

## 2. Where it sits in the pipeline

```
fetch -> validate -> filters -> stale filter -> upsert -> [ load open jobs -> selectJobsToClose -> closeJobs ]
```

- It runs **after** the upsert, so a job that just reappeared is already reopened and won't be closed.
- `selectJobsToClose` is **pure**: no database, no clock (`now` comes in through the policy). The pipeline loads the open jobs (`loadOpenJobs`) and closes the returned ids (`closeJobs`).
- A failed fetch or upsert throws before this step is reached. A dry run calls `selectJobsToClose` to report "would be closed", but never `closeJobs`.

## 3. The decision, top to bottom

```
selectJobsToClose(openJobs, fetchResult, policy)
│
├─ Safety rules (both strategies) ── any true → close NOTHING, record skippedReason
│   1. fetch failed                      (fetchResult.ok === false)
│   2. fetch returned 0 items
│   3. circuit breaker: fetchedCount < previousFetchedCount × minRatio   (skipped on first run)
│
└─ Strategy
    ├─ snapshot  → close open jobs whose externalId is NOT in this fetch
    └─ max_age   → close open jobs older than maxAgeDays (posted_at, else first_seen_at),
                   present in the feed or not
```

The return value is `{ idsToClose, skippedReason }`. `skippedReason` is `null` when the strategy ran. Otherwise it explains why nothing closed, and the pipeline stores it in `ingestion_runs.warnings`.

## 4. The two strategies

### snapshot: "missing means gone"

For feeds that return **every** active job: the ATS boards (Greenhouse, Lever, Ashby) in Layer 3b.

```
open in DB:   a, b, c
this fetch:   a, c
→ close b
```

### max_age: "missing means nothing"

For feeds that return a **window** of recent jobs. Both aggregators are like this:

- **Remote OK:** 100 newest jobs, about 10 weeks deep.
- **Remotive:** only about **15** newest jobs. This was found on the first real fetch (2026-10-14). The plan had snapshot for Remotive; with a 15-job window, snapshot would close live jobs as soon as newer ones pushed them out, so it was switched to max_age before any closing ran.

A job is closed when it's **strictly older** than 30 days, whether or not it's still in the feed:

```
now = Oct 14, maxAgeDays = 30, cutoff = Sep 14
posted Sep 01  → close   (older than the cutoff)
posted Sep 14  → keep    (exactly 30 days: not strictly older)
posted Oct 01  → keep
posted null    → use first_seen_at instead
date "garbage" → keep    (Date.parse gives NaN, and NaN < cutoff is false)
```

The cost: a filled job can stay listed for up to 30 days. That's acceptable for a personal job search, since the employer's page will say it's gone.

## 5. The safety rules (circuit breaker)

| Rule                                     | Why                                                                                                                                                            |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fetch failed                             | No information, so no conclusions. (In practice a failed fetch throws before this step; the rule makes the pure function safe on its own.)                     |
| 0 items                                  | Every job vanishing at once is far less likely than an outage, a rate-limit page, or an API change.                                                            |
| under 50% of the previous successful run | Catches partial failures: a truncated response, a feed that changed shape, a filter gone wrong. The baseline is the last **successful** run's `fetched_count`. |
| first run                                | No baseline, so the 50% rule is skipped. The 0-items rule still applies.                                                                                       |
| exactly 50%                              | Allowed. The comparison is strict `<`.                                                                                                                         |

The rules apply to **both** strategies. For snapshot, they stop "missing" from being misread. For max_age, a collapsed feed is a sign something upstream changed, and pausing is the safe default.

## 6. The stale filter: why closing needs a partner

Remote OK still lists jobs older than 30 days. Without a guard, every run would:

1. **upsert** the 35-day-old job: it's in the feed, so the upsert **reopens** it;
2. **close** it: it's older than 30 days.

The job would flip open and closed on every run. So for max_age sources, `processItems` drops items already past the max age **before** the upsert (counted as `stale_count`). Two details make it airtight:

- **Same boundary.** The stale filter drops items with age `> maxAge`, and `selectJobsToClose` closes items with date `< now - maxAge`. Those are the same condition, so they can't disagree about a job exactly on the line. There's a test for it on each side.
- **No null dates.** If `posted_at` were null, the stale filter couldn't judge the item, but the close step would use `first_seen_at`, and the flip-flop would come back. So the schemas reject unparseable dates (`sourceDateSchema` in `schemas/common.ts`), and the item is counted invalid instead.

## 7. Scope: designed for Layer 3b

The function never looks at `source_id`. "Scope" is just whatever list of `openJobs` the caller passes:

- **Layer 3a** passes all open jobs of one source.
- **Layer 3b** will pass **one company board's** jobs. If Acme's Greenhouse board fails, only Acme's jobs are at stake, and the safety rules see only Acme's counts.

Keeping it pure and scope-agnostic means 3b needs no change to this function, only a different query in front of it.

## 8. Closing in the database

`closeJobs` (`db.ts`) sets `status = 'closed'` and `closed_at = now` together, because the `jobs_status_closed_at_check` constraint requires both or neither. It filters on `status = 'open'`, so closing an already-closed job is a no-op (the integration test checks this). It works in chunks of 200 ids, to keep the request URL short.

When a closed job reappears in a feed, the upsert sets `status = 'open'` and `closed_at = null`. The integration test "closes, then reopens a job that reappears" covers the whole cycle, with `first_seen_at` preserved.

## 9. Design decisions and alternatives

| Decision                           | Alternative                                                                         | Why not                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Strategy per source                | One rule for all                                                                    | "Missing" means different things per feed; one rule is wrong for half of them.      |
| max_age for Remotive               | Snapshot (the original plan)                                                        | A 15-job window would close live jobs. Real data overruled the plan.                |
| max_age                            | Window-aware snapshot (close if missing **and** newer than the oldest item fetched) | Catches early removals, but adds a third strategy for 15 jobs.                      |
| max_age                            | Close by `last_seen_at` (not seen for N days)                                       | If the source is down for N days, everything closes.                                |
| Circuit breaker on both strategies | Only on snapshot                                                                    | A collapsed feed is a warning sign either way; pausing costs little.                |
| Pure function + glue               | Do it all in one SQL `UPDATE`                                                       | The pure function is unit-tested with 14 cases in milliseconds, without a database. |

## 10. Interview questions to practice

1. _"How do you know a job was taken down?"_ It depends on the feed: snapshot for complete feeds, age for windowed ones. Explain the Remotive discovery.
2. _"What stops an outage from closing everything?"_ Three safety rules, checked before either strategy, with the reason logged on the run row.
3. _"Why 50%, and why the previous **successful** run?"_ A failed run's count says nothing about the feed. Fifty percent is loose enough for normal churn and tight enough to catch truncation.
4. _"What's the stale filter for?"_ The reopen/close flip-flop, and why the two boundaries must match.
5. _"How will this work per company board in 3b?"_ Scope is the input list; the function doesn't change.
6. _"What's the cost of age-based closing?"_ A filled job can stay up to 30 days. Say why that's acceptable here.

## 11. Exercises

1. Add a test: snapshot where every open job is missing and the fetch is exactly 50% of the previous count. What should happen, and does it?
2. Make the max age configurable per source from the CLI (`--max-age-days`), and add a test.
3. Write the SQL for "open jobs that would close on the next run" for Remote OK, using `posted_at` and `first_seen_at`.
4. Sketch the window-aware snapshot strategy as a third `ClosePolicy` kind, with its tests.
