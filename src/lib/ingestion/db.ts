// Database reads and writes for the pipeline, other than the job upsert (upsert.ts).
// Every function takes the client as an argument, so tests can point it at the local stack.
import type { PostgrestError } from "@supabase/supabase-js";

import type { AdminClient } from "@/lib/supabase/admin";

import type { OpenJob } from "./reconcile";

/** PostgREST returns at most this many rows per request (Supabase's default max-rows). */
const PAGE_SIZE = 1000;

/** Keeps `.in("id", ids)` filters well under URL length limits. */
export const ID_CHUNK_SIZE = 200;

export function dbError(context: string, error: PostgrestError): Error {
  const detail = [error.code, error.details, error.hint]
    .filter(Boolean)
    .join("; ");
  return new Error(
    `${context}: ${error.message}${detail ? ` (${detail})` : ""}`,
  );
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    chunks.push(items.slice(i, i + size));
  return chunks;
}

export interface PreviousRun {
  startedAt: Date;
  fetchedCount: number;
}

/** The most recent succeeded run of a source: the rate limit and circuit breaker both use it. */
export async function lastSucceededRun(
  db: AdminClient,
  sourceId: string,
): Promise<PreviousRun | null> {
  const { data, error } = await db
    .from("ingestion_runs")
    .select("started_at, fetched_count")
    .eq("source_id", sourceId)
    .eq("status", "succeeded")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("Loading the last succeeded run", error);
  return data
    ? { startedAt: new Date(data.started_at), fetchedCount: data.fetched_count }
    : null;
}

/** When the most recent run of a source started, whatever its status. The rate limit uses it. */
export async function lastRunStartedAt(
  db: AdminClient,
  sourceId: string,
): Promise<Date | null> {
  const { data, error } = await db
    .from("ingestion_runs")
    .select("started_at")
    .eq("source_id", sourceId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("Loading the last run", error);
  return data ? new Date(data.started_at) : null;
}

export async function createRun(
  db: AdminClient,
  sourceId: string,
): Promise<number> {
  const { data, error } = await db
    .from("ingestion_runs")
    .insert({ source_id: sourceId })
    .select("id")
    .single();
  if (error) throw dbError("Creating the ingestion run", error);
  return data.id;
}

export interface RunCounts {
  fetched: number;
  invalid: number;
  notTech: number;
  notRemoteUs: number;
  stale: number;
  eligible: number;
  inserted: number;
  updated: number;
  unchanged: number;
  /** Closed jobs that reappeared and were reopened (a subset of updated + unchanged). */
  reopened: number;
  closed: number;
}

export function emptyCounts(): RunCounts {
  return {
    fetched: 0,
    invalid: 0,
    notTech: 0,
    notRemoteUs: 0,
    stale: 0,
    eligible: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    reopened: 0,
    closed: 0,
  };
}

/** Error text stored on a failed run is capped so one huge message cannot bloat the table. */
const MAX_ERROR_LENGTH = 2000;

export async function finishRun(
  db: AdminClient,
  runId: number,
  result: {
    status: "succeeded" | "failed";
    counts: RunCounts;
    warnings: string[];
    error?: string;
  },
): Promise<void> {
  const { counts } = result;
  const { error } = await db
    .from("ingestion_runs")
    .update({
      status: result.status,
      finished_at: new Date().toISOString(),
      fetched_count: counts.fetched,
      invalid_count: counts.invalid,
      not_tech_count: counts.notTech,
      not_remote_us_count: counts.notRemoteUs,
      stale_count: counts.stale,
      eligible_count: counts.eligible,
      inserted_count: counts.inserted,
      updated_count: counts.updated,
      unchanged_count: counts.unchanged,
      closed_count: counts.closed,
      warnings: result.warnings,
      error: result.error?.slice(0, MAX_ERROR_LENGTH) ?? null,
    })
    .eq("id", runId);
  if (error) throw dbError("Finishing the ingestion run", error);
}

/** All open jobs of a source, paged past PostgREST's row limit. Ordered by id for stable pages. */
export async function loadOpenJobs(
  db: AdminClient,
  sourceId: string,
): Promise<OpenJob[]> {
  const jobs: OpenJob[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("jobs")
      .select("id, external_id, posted_at, first_seen_at")
      .eq("source_id", sourceId)
      .eq("status", "open")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw dbError("Loading open jobs", error);
    for (const row of data) {
      jobs.push({
        id: row.id,
        externalId: row.external_id,
        postedAt: row.posted_at,
        firstSeenAt: row.first_seen_at,
      });
    }
    if (data.length < PAGE_SIZE) return jobs;
  }
}

/**
 * Marks jobs closed. status and closed_at are set together, which jobs_status_closed_at_check
 * requires. The status = 'open' filter makes it a no-op for a job closed in the meantime.
 */
export async function closeJobs(
  db: AdminClient,
  ids: readonly number[],
  now: Date,
): Promise<number> {
  let closed = 0;
  for (const idChunk of chunk(ids, ID_CHUNK_SIZE)) {
    const { data, error } = await db
      .from("jobs")
      .update({ status: "closed", closed_at: now.toISOString() })
      .in("id", idChunk)
      .eq("status", "open")
      .select("id");
    if (error) throw dbError("Closing jobs", error);
    closed += data.length;
  }
  return closed;
}
