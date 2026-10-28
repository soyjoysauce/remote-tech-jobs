// Shared types for the ingestion pipeline.
//
// Each source gets an adapter that knows that source's quirks (URL, response shape, field
// names). Everything after normalize() is source-agnostic, so adding a source means writing one
// adapter and registering it; the pipeline does not change.
import type { z } from "zod";

import type { Json, TablesInsert } from "@/lib/supabase/database.types";

import type { RemoteRegion } from "./classify/remote-us";
import type { FetchImpl } from "./http";

export type SourceId = "remotive" | "remoteok";

/** Values allowed by the jobs.employment_type CHECK constraint. */
export type EmploymentType =
  "full_time" | "part_time" | "contract" | "internship" | "temporary" | "other";

/** Values allowed by the jobs.remote_region CHECK constraint. non_us jobs are never stored. */
export type StoredRemoteRegion = Exclude<RemoteRegion, "non_us">;

type JobInsert = TablesInsert<"jobs">;

/**
 * What an adapter produces from one source item. Column names match the jobs table, and the
 * types are picked from the generated Insert type, so a renamed or retyped column breaks the
 * build here instead of failing at runtime. Required<> turns optional columns into required
 * ones (still nullable), so an adapter cannot forget a field by omission.
 */
export type NormalizedJob = Required<
  Pick<
    JobInsert,
    | "external_id"
    | "company_name"
    | "title"
    | "description_html"
    | "description_text"
    | "apply_url"
    | "source_url"
    | "location_raw"
    | "department"
    | "tags"
    | "salary_min"
    | "salary_max"
    | "salary_currency"
    | "salary_period"
    | "posted_at"
  >
> & {
  source_id: SourceId;
  employment_type: EmploymentType | null;
  /** The source's own "this is remote" signal. Both aggregators list remote jobs only. */
  source_remote_flag: boolean;
};

/**
 * A normalized job after classification: exactly the columns the pipeline writes.
 * source_id is any sources.id here (the database checks it), so tests can use their own source.
 */
export type JobRow = Omit<NormalizedJob, "source_remote_flag" | "source_id"> & {
  source_id: string;
  is_remote: boolean;
  remote_region: StoredRemoteRegion;
  dedupe_key: string;
  content_hash: string;
  raw: Json;
};

/** How a source's jobs get closed. See docs/decisions/0008-dedupe-and-closing-strategy.md. */
export type CloseStrategy =
  { kind: "snapshot" } | { kind: "max_age"; maxAgeDays: number };

export interface FetchContext {
  fetchImpl?: FetchImpl;
}

export interface SourceAdapter<Item> {
  id: SourceId;
  closeStrategy: CloseStrategy;
  /**
   * Skip a scheduled run if the last successful one was more recent than this (ms).
   * Undefined means no limit. Overridden by --force.
   */
  minIntervalMs?: number;
  /**
   * Fetches the source and returns its job items, unvalidated. Throws if the response as a whole
   * is unusable (HTTP failure, wrong top-level shape): that fails the run. Individual items are
   * validated later against itemSchema, so one bad item never fails the run.
   */
  fetchJobs(ctx: FetchContext): Promise<unknown[]>;
  itemSchema: z.ZodType<Item>;
  /** Maps one validated item to the shared shape. Pure: no I/O. */
  normalize(item: Item): NormalizedJob;
}
