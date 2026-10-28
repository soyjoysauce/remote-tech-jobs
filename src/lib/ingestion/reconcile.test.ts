import { describe, expect, it } from "vitest";

import {
  selectJobsToClose,
  type ClosePolicy,
  type FetchResult,
  type OpenJob,
} from "./reconcile";

function job(
  id: number,
  externalId: string,
  postedAt: string | null,
  firstSeenAt = "2026-10-01T00:00:00Z",
): OpenJob {
  return { id, externalId, postedAt, firstSeenAt };
}

function fetched(
  fetchedCount: number,
  presentExternalIds: string[],
): FetchResult {
  return {
    ok: true,
    fetchedCount,
    presentExternalIds: new Set(presentExternalIds),
  };
}

const snapshot = (previousFetchedCount: number | null): ClosePolicy => ({
  kind: "snapshot",
  previousFetchedCount,
  minRatio: 0.5,
});

const now = new Date("2026-10-14T00:00:00Z");
const maxAge = (previousFetchedCount: number | null = 10): ClosePolicy => ({
  kind: "max_age",
  maxAgeDays: 30,
  now,
  previousFetchedCount,
  minRatio: 0.5,
});

const openJobs = [
  job(1, "a", "2026-10-10T00:00:00Z"),
  job(2, "b", "2026-10-10T00:00:00Z"),
];

describe("selectJobsToClose: snapshot", () => {
  it("closes a missing job and keeps a present one", () => {
    const decision = selectJobsToClose(
      openJobs,
      fetched(10, ["a"]),
      snapshot(10),
    );
    expect(decision.idsToClose).toEqual([2]);
    expect(decision.skippedReason).toBeNull();
  });

  it("closes nothing when every job is present", () => {
    expect(
      selectJobsToClose(openJobs, fetched(10, ["a", "b"]), snapshot(10))
        .idsToClose,
    ).toEqual([]);
  });

  it("returns database ids, not external ids", () => {
    const decision = selectJobsToClose(
      [job(42, "x", null)],
      fetched(10, ["y"]),
      snapshot(10),
    );
    expect(decision.idsToClose).toEqual([42]);
  });
});

describe("selectJobsToClose: safety rules", () => {
  it("closes nothing when the fetch failed", () => {
    const decision = selectJobsToClose(openJobs, { ok: false }, snapshot(10));
    expect(decision.idsToClose).toEqual([]);
    expect(decision.skippedReason).toEqual(expect.any(String));
  });

  it("closes nothing when the fetch returned 0 items", () => {
    const decision = selectJobsToClose(openJobs, fetched(0, []), snapshot(10));
    expect(decision.idsToClose).toEqual([]);
    expect(decision.skippedReason).toEqual(expect.any(String));
  });

  it("closes nothing when the count drops below 50% of the previous run", () => {
    const decision = selectJobsToClose(
      openJobs,
      fetched(4, ["a"]),
      snapshot(10),
    );
    expect(decision.idsToClose).toEqual([]);
    expect(decision.skippedReason).toEqual(expect.any(String));
  });

  it("allows a drop to exactly 50%", () => {
    expect(
      selectJobsToClose(openJobs, fetched(5, ["a"]), snapshot(10)).idsToClose,
    ).toEqual([2]);
  });

  it("skips the ratio check on the first run (no previous count)", () => {
    expect(
      selectJobsToClose(openJobs, fetched(1, ["a"]), snapshot(null)).idsToClose,
    ).toEqual([2]);
  });

  it("still refuses an empty fetch on the first run", () => {
    expect(
      selectJobsToClose(openJobs, fetched(0, []), snapshot(null)).idsToClose,
    ).toEqual([]);
  });

  it("applies to the age-based strategy too", () => {
    const old = [job(1, "a", "2026-08-01T00:00:00Z")];
    expect(selectJobsToClose(old, fetched(0, []), maxAge()).idsToClose).toEqual(
      [],
    );
    expect(
      selectJobsToClose(old, fetched(4, []), maxAge(10)).idsToClose,
    ).toEqual([]);
    expect(selectJobsToClose(old, { ok: false }, maxAge()).idsToClose).toEqual(
      [],
    );
  });
});

describe("selectJobsToClose: max_age", () => {
  it("closes only jobs past max age, regardless of presence", () => {
    const jobs = [
      job(1, "old-present", "2026-09-01T00:00:00Z"),
      job(2, "old-missing", "2026-09-01T00:00:00Z"),
      job(3, "new-present", "2026-10-01T00:00:00Z"),
      job(4, "new-missing", "2026-10-01T00:00:00Z"),
    ];
    const decision = selectJobsToClose(
      jobs,
      fetched(10, ["old-present", "new-present"]),
      maxAge(),
    );
    expect([...decision.idsToClose].sort()).toEqual([1, 2]);
    expect(decision.skippedReason).toBeNull();
  });

  it("keeps a job exactly at max age (closes only when strictly older)", () => {
    // The pipeline's stale filter uses the same boundary, so the two never disagree.
    const decision = selectJobsToClose(
      [job(1, "a", "2026-09-14T00:00:00Z")],
      fetched(10, []),
      maxAge(),
    );
    expect(decision.idsToClose).toEqual([]);
  });

  it("falls back to firstSeenAt when postedAt is null", () => {
    const jobs = [
      job(1, "seen-long-ago", null, "2026-08-01T00:00:00Z"),
      job(2, "seen-recently", null, "2026-10-10T00:00:00Z"),
    ];
    expect(
      selectJobsToClose(jobs, fetched(10, []), maxAge()).idsToClose,
    ).toEqual([1]);
  });

  it("returns nothing for an empty scope", () => {
    expect(selectJobsToClose([], fetched(10, []), maxAge())).toEqual({
      idsToClose: [],
      skippedReason: null,
    });
  });
});
