import { describe, expect, it } from "vitest";

import { contentHash } from "./hash";
import type { JobRow } from "./types";

const base: Omit<JobRow, "raw" | "content_hash"> = {
  source_id: "remoteok",
  external_id: "1",
  company_name: "Acme",
  title: "Software Engineer",
  description_html: "<p>Hi</p>",
  description_text: "Hi",
  apply_url: "https://acme.test/apply",
  source_url: "https://remoteok.com/remote-jobs/1",
  location_raw: "Remote - US",
  department: null,
  tags: ["typescript"],
  salary_min: null,
  salary_max: null,
  salary_currency: null,
  salary_period: null,
  posted_at: "2026-10-01T00:00:00.000Z",
  employment_type: "full_time",
  is_remote: true,
  remote_region: "us",
  dedupe_key: "acme|software engineer",
};

describe("contentHash", () => {
  it("is a stable 64-character hex string", () => {
    expect(contentHash(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(contentHash(base)).toBe(contentHash({ ...base }));
  });

  it("ignores property order", () => {
    const reversed = Object.fromEntries(
      Object.entries(base).reverse(),
    ) as typeof base;
    expect(contentHash(reversed)).toBe(contentHash(base));
  });

  it("changes when a stored field changes", () => {
    expect(
      contentHash({ ...base, title: "Senior Software Engineer" }),
    ).not.toBe(contentHash(base));
  });

  it("changes when a derived field changes, so classifier fixes reach existing rows", () => {
    expect(contentHash({ ...base, remote_region: "worldwide" })).not.toBe(
      contentHash(base),
    );
  });
});
