import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { remoteOkAdapter, repairMojibake, REMOTEOK_URL } from "./remoteok";
import type { FetchImpl } from "../http";
import { remoteOkEnvelopeSchema, type RemoteOkJob } from "../schemas/remoteok";

// A real response captured on 2026-10-14: the legal notice, 5 jobs, and one deliberately invalid
// item (url removed).
const fixture: unknown = JSON.parse(
  readFileSync("tests/fixtures/remoteok.json", "utf8"),
);

function serve(body: unknown): { fetchImpl: FetchImpl; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl: FetchImpl = async (url) => {
    urls.push(url);
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { fetchImpl, urls };
}

const minimalJob: RemoteOkJob = {
  id: "1",
  url: "https://remoteok.com/remote-jobs/1",
  position: "Software Engineer",
  company: "Acme",
  date: "2026-10-01T00:00:00+00:00",
};

describe("remoteok schema", () => {
  it("accepts the captured envelope", () => {
    expect(remoteOkEnvelopeSchema.safeParse(fixture).success).toBe(true);
  });

  it("rejects a non-array envelope", () => {
    expect(remoteOkEnvelopeSchema.safeParse({ jobs: [] }).success).toBe(false);
  });
});

describe("remoteOkAdapter.fetchJobs", () => {
  it("drops the legal notice and keeps every job item", async () => {
    const { fetchImpl, urls } = serve(fixture);
    const items = await remoteOkAdapter.fetchJobs({ fetchImpl });

    expect(urls).toEqual([REMOTEOK_URL]);
    expect(items).toHaveLength(6);
    expect(
      items.some(
        (item) => typeof item === "object" && item !== null && "legal" in item,
      ),
    ).toBe(false);
  });

  it("keeps the first job when there is no legal notice", async () => {
    const { fetchImpl } = serve([minimalJob]);
    expect(await remoteOkAdapter.fetchJobs({ fetchImpl })).toHaveLength(1);
  });

  it("validates 5 of the 6 items and rejects the one without a url", async () => {
    const { fetchImpl } = serve(fixture);
    const items = await remoteOkAdapter.fetchJobs({ fetchImpl });
    const results = items.map((item) =>
      remoteOkAdapter.itemSchema.safeParse(item),
    );
    expect(results.filter((r) => r.success)).toHaveLength(5);
  });
});

describe("remoteOkAdapter.normalize", () => {
  it("maps a fixture job with salary to the shared shape", async () => {
    const { fetchImpl } = serve(fixture);
    const items = await remoteOkAdapter.fetchJobs({ fetchImpl });
    const parsed = items
      .map((i) => remoteOkAdapter.itemSchema.safeParse(i))
      .flatMap((r) => (r.success ? [r.data] : []));
    const job = parsed
      .map((j) => remoteOkAdapter.normalize(j))
      .find((j) => j.external_id === "1137475");

    expect(job).toMatchObject({
      source_id: "remoteok",
      title: "Senior React Full stack Developer",
      salary_min: 80000,
      salary_currency: "USD",
      salary_period: "year",
      source_remote_flag: true,
    });
    // The listing on Remote OK, for the followed attribution link. Host lower-cased.
    expect(job?.source_url).toMatch(/^https:\/\/remoteok\.com\/remote-jobs\//);
    expect(job?.posted_at).toBe("2026-10-09T13:09:18.000Z");
  });

  it("treats 0 salaries as missing", () => {
    const job = remoteOkAdapter.normalize({
      ...minimalJob,
      salary_min: 0,
      salary_max: 0,
    });
    expect(job).toMatchObject({
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      salary_period: null,
    });
  });

  it("drops a salary range whose min is above its max", () => {
    const job = remoteOkAdapter.normalize({
      ...minimalJob,
      salary_min: 200000,
      salary_max: 100000,
    });
    expect(job.salary_min).toBeNull();
    expect(job.salary_max).toBeNull();
  });

  it("falls back to the listing url when apply_url is missing or not http(s)", () => {
    expect(
      remoteOkAdapter.normalize({ ...minimalJob, apply_url: "" }).apply_url,
    ).toBe(minimalJob.url);
    expect(
      remoteOkAdapter.normalize({
        ...minimalJob,
        apply_url: "javascript:alert(1)",
      }).apply_url,
    ).toBe(minimalJob.url);
  });

  it("stores an empty location as null", () => {
    expect(
      remoteOkAdapter.normalize({ ...minimalJob, location: "  " }).location_raw,
    ).toBeNull();
  });

  it("repairs mojibake in text fields", () => {
    const job = remoteOkAdapter.normalize({
      ...minimalJob,
      location: "Ciudad de MÃ©xico, Mexico",
    });
    expect(job.location_raw).toBe("Ciudad de México, Mexico");
  });
});

describe("repairMojibake", () => {
  it("re-decodes UTF-8 read as Latin-1", () => {
    expect(repairMojibake("MÃ©xico")).toBe("México");
    expect(repairMojibake("Telefondienst fÃ¼r")).toBe("Telefondienst für");
  });

  it("leaves correct text alone", () => {
    expect(repairMojibake("México")).toBe("México");
    expect(repairMojibake("Plain ASCII")).toBe("Plain ASCII");
    // Has characters beyond Latin-1, so it cannot be mojibake of this kind.
    expect(repairMojibake("Zürich Ã© 東京")).toBe("Zürich Ã© 東京");
  });

  it("leaves text alone when re-decoding would produce invalid UTF-8", () => {
    expect(repairMojibake("Â")).toBe("Â");
    expect(repairMojibake("Ã© then Ã")).toBe("Ã© then Ã");
  });
});
