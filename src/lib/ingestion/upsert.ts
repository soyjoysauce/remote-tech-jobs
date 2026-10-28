// Writes a batch of jobs for one source, keyed on (source_id, external_id).
//
// Rules:
// - first_seen_at is never overwritten.
// - last_seen_at is always bumped.
// - When content_hash is unchanged, no listing field is rewritten.
// - A closed job that reappears is reopened.
//
// How: read the stored hash for every incoming external_id, then split the batch three ways:
//   new        -> INSERT, with first_seen_at = last_seen_at = the run's time.
//   changed    -> UPSERT with every listing column, but NOT first_seen_at. PostgREST's
//                 ON CONFLICT DO UPDATE only sets the columns in the payload, so first_seen_at
//                 keeps its stored value.
//   unchanged  -> UPDATE of last_seen_at, status and closed_at only.
//
// Alternative: one SQL function (ON CONFLICT ... DO UPDATE ... WHERE content_hash IS DISTINCT
// FROM excluded.content_hash) called over RPC. One round trip and atomic, but it moves the logic
// into SQL that is harder to test, and it is a function the publishable key must be denied. With
// a single writer there is no race between the read and the writes, so plain queries suffice.
import type { AdminClient } from "@/lib/supabase/admin";

import { chunk, dbError, ID_CHUNK_SIZE } from "./db";
import type { JobRow } from "./types";

export interface UpsertResult {
  inserted: number;
  updated: number;
  unchanged: number;
  /** Jobs that were closed and are open again (counted in updated or unchanged too). */
  reopened: number;
}

interface StoredJob {
  id: number;
  content_hash: string | null;
  status: "open" | "closed";
}

async function loadStored(
  db: AdminClient,
  sourceId: string,
  externalIds: readonly string[],
): Promise<Map<string, StoredJob>> {
  const stored = new Map<string, StoredJob>();
  for (const idChunk of chunk(externalIds, ID_CHUNK_SIZE)) {
    const { data, error } = await db
      .from("jobs")
      .select("id, external_id, content_hash, status")
      .eq("source_id", sourceId)
      .in("external_id", idChunk);
    if (error) throw dbError("Loading stored jobs", error);
    for (const row of data) stored.set(row.external_id, row);
  }
  return stored;
}

/**
 * Upserts rows that all belong to sourceId. With dryRun, reads but writes nothing, and returns
 * what it would have done.
 */
export async function upsertJobs(
  db: AdminClient,
  sourceId: string,
  rows: readonly JobRow[],
  options: { now: Date; dryRun: boolean },
): Promise<UpsertResult> {
  const stored = await loadStored(
    db,
    sourceId,
    rows.map((r) => r.external_id),
  );

  const toInsert: JobRow[] = [];
  const toUpdate: JobRow[] = [];
  const unchangedIds: number[] = [];
  let reopened = 0;

  for (const row of rows) {
    const existing = stored.get(row.external_id);
    if (!existing) {
      toInsert.push(row);
      continue;
    }
    if (existing.status === "closed") reopened++;
    if (existing.content_hash === row.content_hash)
      unchangedIds.push(existing.id);
    else toUpdate.push(row);
  }

  const result: UpsertResult = {
    inserted: toInsert.length,
    updated: toUpdate.length,
    unchanged: unchangedIds.length,
    reopened,
  };
  if (options.dryRun) return result;

  const seenAt = options.now.toISOString();
  // Written on every row the feed still lists: this is what bumps last_seen_at and reopens.
  const seen = {
    last_seen_at: seenAt,
    status: "open" as const,
    closed_at: null,
  };

  if (toInsert.length > 0) {
    // Timestamps from the run's clock rather than the column default, so every row a run writes
    // carries the same time. This is the only place first_seen_at is ever written.
    const { error } = await db.from("jobs").insert(
      toInsert.map((row) => ({
        ...row,
        first_seen_at: seenAt,
        last_seen_at: seenAt,
      })),
    );
    if (error) throw dbError("Inserting jobs", error);
  }

  if (toUpdate.length > 0) {
    const { error } = await db.from("jobs").upsert(
      toUpdate.map((row) => ({ ...row, ...seen })),
      { onConflict: "source_id,external_id" },
    );
    if (error) throw dbError("Updating changed jobs", error);
  }

  for (const idChunk of chunk(unchangedIds, ID_CHUNK_SIZE)) {
    const { error } = await db.from("jobs").update(seen).in("id", idChunk);
    if (error) throw dbError("Touching unchanged jobs", error);
  }

  return result;
}
