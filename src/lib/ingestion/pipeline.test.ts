import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { remoteOkAdapter } from "./adapters/remoteok";
import { isTechRole } from "./classify/tech";
import { processItems, type Classifiers } from "./pipeline";

// Stand-ins for the TODO(human) functions, so these tests exercise the pipeline's own logic
// (counting, filtering order, stale filter, hashing) independently of the real implementations.
const stubClassifiers: Classifiers = {
  isTechRole,
  classifyRemoteUS: ({ locationRaw }) => {
    const nonUs =
      locationRaw !== null && /ireland|uk|europe/i.test(locationRaw);
    return nonUs
      ? { isRemote: true, remoteRegion: "non_us", eligible: false }
      : {
          isRemote: true,
          remoteRegion: locationRaw ? "us" : "unknown",
          eligible: true,
        };
  },
  computeDedupeKey: (company, title) =>
    `${company.toLowerCase()}|${title.toLowerCase()}`,
};

const fixture: unknown = JSON.parse(
  readFileSync("tests/fixtures/remoteok.json", "utf8"),
);
const items = Array.isArray(fixture) ? fixture.slice(1) : [];

// The fixture's jobs were posted between 2026-08-12 and 2026-10-13.
const now = new Date("2026-10-14T12:00:00Z");

describe("processItems with the Remote OK fixture", () => {
  const result = processItems(remoteOkAdapter, items, {
    now,
    classifiers: stubClassifiers,
  });

  it("accounts for every fetched item exactly once", () => {
    const { fetched, invalid, notTech, notRemoteUs, stale, eligible } =
      result.counts;
    expect(fetched).toBe(6);
    expect(invalid + notTech + notRemoteUs + stale + eligible).toBe(fetched);
  });

  it("counts each reason for dropping an item", () => {
    expect(result.counts).toEqual({
      fetched: 6,
      invalid: 1, // the item without a url
      notTech: 1, // Customer Support Specialist
      notRemoteUs: 1, // Frontend Engineer, Ireland
      stale: 1, // Staff Software Engineer, posted 2026-08-12: past 30 days
      eligible: 2,
    });
  });

  it("produces rows with derived fields, a hash and the raw item", () => {
    expect(result.rows.map((r) => r.external_id).sort()).toEqual([
      "1137475",
      "1137508",
    ]);
    for (const row of result.rows) {
      expect(row.content_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.dedupe_key).toBe(
        `${row.company_name.toLowerCase()}|${row.title.toLowerCase()}`,
      );
      expect(row).not.toHaveProperty("source_remote_flag");
      // raw keeps keys the schema does not list.
      expect(row.raw).toHaveProperty("slug");
    }
  });

  it("is deterministic: same input, same hashes", () => {
    const again = processItems(remoteOkAdapter, items, {
      now,
      classifiers: stubClassifiers,
    });
    expect(again.rows.map((r) => r.content_hash)).toEqual(
      result.rows.map((r) => r.content_hash),
    );
  });
});

describe("processItems edge cases", () => {
  const job = {
    id: "1",
    url: "https://remoteok.com/remote-jobs/1",
    position: "Software Engineer",
    company: "Acme",
    date: "2026-10-10T00:00:00+00:00",
  };

  it("keeps the first of two items with the same external_id and warns", () => {
    const result = processItems(
      remoteOkAdapter,
      [job, { ...job, position: "Backend Engineer" }],
      {
        now,
        classifiers: stubClassifiers,
      },
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.title).toBe("Software Engineer");
    expect(result.warnings).toEqual([
      "duplicate external_id 1 in feed; kept the first",
    ]);
  });

  it("counts an unparseable date as invalid, so no stored job lacks posted_at", () => {
    // A null posted_at would skip the stale filter, and an old job would then be reopened and
    // closed on every run. The schema rejects the item instead.
    const result = processItems(
      remoteOkAdapter,
      [{ ...job, date: "not a date" }],
      { now, classifiers: stubClassifiers },
    );
    expect(result.counts.invalid).toBe(1);
    expect(result.rows).toHaveLength(0);
  });

  it("counts a javascript: listing url as invalid (stored XSS guard)", () => {
    const result = processItems(
      remoteOkAdapter,
      [{ ...job, url: "javascript:alert(1)" }],
      { now, classifiers: stubClassifiers },
    );
    expect(result.counts.invalid).toBe(1);
  });

  it("counts a job exactly at max age as fresh", () => {
    const result = processItems(
      remoteOkAdapter,
      [{ ...job, date: "2026-09-14T12:00:00+00:00" }],
      {
        now,
        classifiers: stubClassifiers,
      },
    );
    expect(result.counts.eligible).toBe(1);
  });
});
