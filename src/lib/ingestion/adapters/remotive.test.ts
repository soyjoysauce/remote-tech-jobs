import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { remotiveAdapter, REMOTIVE_URL } from "./remotive";
import type { FetchImpl } from "../http";
import { remotiveEnvelopeSchema } from "../schemas/remotive";

// A real response captured on 2026-10-14, trimmed to 5 jobs plus one deliberately invalid item
// (id is not a number, title is missing).
const fixture: unknown = JSON.parse(
  readFileSync("tests/fixtures/remotive.json", "utf8"),
);

function serve(body: unknown): { fetchImpl: FetchImpl; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl: FetchImpl = async (url) => {
    urls.push(url);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetchImpl, urls };
}

async function fetchFixtureItems() {
  const { fetchImpl } = serve(fixture);
  return remotiveAdapter.fetchJobs({ fetchImpl });
}

describe("remotive schema", () => {
  it("accepts the captured envelope", () => {
    expect(remotiveEnvelopeSchema.safeParse(fixture).success).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>x</script>",
    "ftp://remotive.com/x",
  ])("rejects a job whose url is %s (it becomes an href in Layer 6)", (url) => {
    const job = {
      id: 1,
      url,
      title: "Developer",
      company_name: "Acme",
      publication_date: "2026-10-01T00:00:00",
    };
    expect(remotiveAdapter.itemSchema.safeParse(job).success).toBe(false);
  });

  it("rejects a job whose publication_date cannot be parsed", () => {
    const job = {
      id: 1,
      url: "https://remotive.com/remote-jobs/x-1",
      title: "Developer",
      company_name: "Acme",
      publication_date: "yesterday",
    };
    expect(remotiveAdapter.itemSchema.safeParse(job).success).toBe(false);
  });

  it("rejects an envelope without jobs", () => {
    expect(remotiveEnvelopeSchema.safeParse({ "job-count": 0 }).success).toBe(
      false,
    );
  });

  it("validates 5 of the 6 fixture items and rejects the broken one", async () => {
    const items = await fetchFixtureItems();
    const results = items.map((item) =>
      remotiveAdapter.itemSchema.safeParse(item),
    );
    expect(results.filter((r) => r.success)).toHaveLength(5);
    expect(results.filter((r) => !r.success)).toHaveLength(1);
  });
});

describe("remotiveAdapter.fetchJobs", () => {
  it("calls the software-dev endpoint and returns every item, unvalidated", async () => {
    const { fetchImpl, urls } = serve(fixture);
    const items = await remotiveAdapter.fetchJobs({ fetchImpl });
    expect(urls).toEqual([REMOTIVE_URL]);
    expect(items).toHaveLength(6);
  });

  it("fails the run when the envelope is wrong", async () => {
    const { fetchImpl } = serve({ error: "rate limited" });
    await expect(remotiveAdapter.fetchJobs({ fetchImpl })).rejects.toThrow();
  });
});

describe("remotiveAdapter.normalize", () => {
  async function normalizedFixture() {
    const items = await fetchFixtureItems();
    return items.flatMap((item) => {
      const parsed = remotiveAdapter.itemSchema.safeParse(item);
      return parsed.success ? [remotiveAdapter.normalize(parsed.data)] : [];
    });
  }

  it("maps a job to the shared shape", async () => {
    const jobs = await normalizedFixture();
    const job = jobs.find((j) => j.external_id === "2069746");

    expect(job).toMatchObject({
      source_id: "remotive",
      title: "Tech Lead Full-Stack Rails Engineer",
      location_raw: "USA, Canada, USA timezones",
      source_remote_flag: true,
      employment_type: "full_time",
      salary_min: null,
    });
    // The Remotive listing is both the attribution link and where applying starts.
    expect(job?.source_url).toMatch(/^https:\/\/remotive\.com\/remote-jobs\//);
    expect(job?.apply_url).toBe(job?.source_url);
  });

  it("reads publication_date as UTC", async () => {
    const jobs = await normalizedFixture();
    for (const job of jobs)
      expect(job.posted_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/,
      );
  });

  it("trims company names", async () => {
    const jobs = await normalizedFixture();
    for (const job of jobs)
      expect(job.company_name).toBe(job.company_name.trim());
  });

  it("maps freelance to contract", () => {
    const job = remotiveAdapter.normalize({
      id: 1,
      url: "https://remotive.com/remote-jobs/software-dev/x-1",
      title: "Developer",
      company_name: "Acme",
      job_type: "freelance",
      publication_date: "2026-10-01T00:00:00",
    });
    expect(job.employment_type).toBe("contract");
  });

  it("stores sanitized HTML and derived text", async () => {
    const jobs = await normalizedFixture();
    for (const job of jobs) {
      expect(job.description_html).not.toMatch(/<script|on\w+=|class=/i);
      expect(job.description_text).not.toMatch(/<[a-z]/i);
    }
  });
});
