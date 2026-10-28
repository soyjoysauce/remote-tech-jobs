// Upsert and close against the local Supabase stack (npm run db:start).
// Uses its own source row, so it never touches jobs from real ingestion runs.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createAdminClient } from "@/lib/supabase/admin";

import { closeJobs } from "./db";
import { contentHash } from "./hash";
import type { JobRow } from "./types";
import { upsertJobs } from "./upsert";

const SOURCE = "it_test";
const db = createAdminClient();

function makeRow(externalId: string, overrides: Partial<JobRow> = {}): JobRow {
  const fields = {
    source_id: SOURCE,
    external_id: externalId,
    company_name: "Acme",
    title: "Software Engineer",
    description_html: "<p>Build things.</p>",
    description_text: "Build things.",
    apply_url: `https://acme.test/apply/${externalId}`,
    source_url: `https://source.test/jobs/${externalId}`,
    location_raw: "Remote - US",
    department: null,
    tags: ["typescript"],
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    posted_at: "2026-10-01T00:00:00.000Z",
    employment_type: "full_time" as const,
    is_remote: true,
    remote_region: "us" as const,
    dedupe_key: "acme|software engineer",
    ...overrides,
  };
  return {
    ...fields,
    content_hash: contentHash(fields),
    raw: { id: externalId },
  };
}

async function readJob(externalId: string) {
  const { data, error } = await db
    .from("jobs")
    .select(
      "id, title, description_text, content_hash, status, closed_at, first_seen_at, last_seen_at",
    )
    .eq("source_id", SOURCE)
    .eq("external_id", externalId)
    .single();
  if (error) throw error;
  return data;
}

const t1 = new Date("2026-10-10T00:00:00.000Z");
const t2 = new Date("2026-10-11T00:00:00.000Z");
const t3 = new Date("2026-10-12T00:00:00.000Z");
const t4 = new Date("2026-10-13T00:00:00.000Z");

async function deleteTestJobs() {
  const { error } = await db.from("jobs").delete().eq("source_id", SOURCE);
  if (error) throw error;
}

beforeAll(async () => {
  const { error } = await db.from("sources").upsert({
    id: SOURCE,
    kind: "aggregator",
    display_name: "Integration test source",
    api_base_url: "https://source.test/api",
  });
  if (error) throw error;
});

beforeEach(deleteTestJobs);

afterAll(async () => {
  await deleteTestJobs();
  await db.from("sources").delete().eq("id", SOURCE);
});

describe("upsertJobs", () => {
  it("inserts new jobs with first_seen_at = last_seen_at = the run time", async () => {
    const result = await upsertJobs(db, SOURCE, [makeRow("a"), makeRow("b")], {
      now: t1,
      dryRun: false,
    });

    expect(result).toEqual({
      inserted: 2,
      updated: 0,
      unchanged: 0,
      reopened: 0,
    });
    const job = await readJob("a");
    expect(job.status).toBe("open");
    expect(new Date(job.first_seen_at)).toEqual(t1);
    expect(new Date(job.last_seen_at)).toEqual(t1);
  });

  it("re-running unchanged rows rewrites no field but bumps last_seen_at", async () => {
    await upsertJobs(db, SOURCE, [makeRow("a")], { now: t1, dryRun: false });
    // Tamper with a stored field. If the second run rewrote fields, this would be overwritten.
    await db
      .from("jobs")
      .update({ description_text: "SENTINEL" })
      .eq("source_id", SOURCE)
      .eq("external_id", "a");

    const result = await upsertJobs(db, SOURCE, [makeRow("a")], {
      now: t2,
      dryRun: false,
    });

    expect(result).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 1,
      reopened: 0,
    });
    const job = await readJob("a");
    expect(job.description_text).toBe("SENTINEL");
    expect(new Date(job.last_seen_at)).toEqual(t2);
    expect(new Date(job.first_seen_at)).toEqual(t1);
  });

  it("rewrites fields when the content hash changes, keeping first_seen_at", async () => {
    await upsertJobs(db, SOURCE, [makeRow("a")], { now: t1, dryRun: false });

    const changed = makeRow("a", { title: "Senior Software Engineer" });
    const result = await upsertJobs(db, SOURCE, [changed], {
      now: t2,
      dryRun: false,
    });

    expect(result.updated).toBe(1);
    const job = await readJob("a");
    expect(job.title).toBe("Senior Software Engineer");
    expect(job.content_hash).toBe(changed.content_hash);
    expect(new Date(job.first_seen_at)).toEqual(t1);
    expect(new Date(job.last_seen_at)).toEqual(t2);
  });

  it("closes, then reopens a job that reappears, preserving first_seen_at throughout", async () => {
    await upsertJobs(db, SOURCE, [makeRow("a")], { now: t1, dryRun: false });
    const { id } = await readJob("a");

    expect(await closeJobs(db, [id], t2)).toBe(1);
    const closed = await readJob("a");
    expect(closed.status).toBe("closed");
    expect(new Date(closed.closed_at ?? "")).toEqual(t2);

    // Closing an already closed job is a no-op.
    expect(await closeJobs(db, [id], t3)).toBe(0);

    const result = await upsertJobs(db, SOURCE, [makeRow("a")], {
      now: t4,
      dryRun: false,
    });
    expect(result).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 1,
      reopened: 1,
    });

    const reopened = await readJob("a");
    expect(reopened.status).toBe("open");
    expect(reopened.closed_at).toBeNull();
    expect(new Date(reopened.first_seen_at)).toEqual(t1);
    expect(new Date(reopened.last_seen_at)).toEqual(t4);
  });

  it("reopens a closed job whose content also changed", async () => {
    await upsertJobs(db, SOURCE, [makeRow("a")], { now: t1, dryRun: false });
    await closeJobs(db, [(await readJob("a")).id], t2);

    const result = await upsertJobs(
      db,
      SOURCE,
      [makeRow("a", { title: "Staff Engineer" })],
      { now: t3, dryRun: false },
    );
    expect(result).toEqual({
      inserted: 0,
      updated: 1,
      unchanged: 0,
      reopened: 1,
    });

    const job = await readJob("a");
    expect(job).toMatchObject({
      status: "open",
      closed_at: null,
      title: "Staff Engineer",
    });
    expect(new Date(job.first_seen_at)).toEqual(t1);
  });

  it("writes nothing in a dry run but reports what it would do", async () => {
    await upsertJobs(db, SOURCE, [makeRow("a")], { now: t1, dryRun: false });

    const result = await upsertJobs(db, SOURCE, [makeRow("a"), makeRow("b")], {
      now: t2,
      dryRun: true,
    });
    expect(result).toEqual({
      inserted: 1,
      updated: 0,
      unchanged: 1,
      reopened: 0,
    });

    const { count } = await db
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("source_id", SOURCE);
    expect(count).toBe(1);
    expect(new Date((await readJob("a")).last_seen_at)).toEqual(t1);
  });
});
