// content_hash: a fingerprint of everything the pipeline would write for a job.
//
// On each run the pipeline compares the new hash with the stored one. Equal means nothing about
// the listing changed, so only last_seen_at is written. That saves rewriting a large
// description_html on every run, and it lets a run report how many listings really changed.
import { createHash } from "node:crypto";

import type { JobRow } from "./types";

/**
 * Fields that are not part of the listing's content:
 * - raw: the source payload can change (a view counter, a re-ordered tag list) without any
 *   field we store changing.
 * - content_hash: the output itself.
 *
 * Derived fields (remote_region, is_remote, dedupe_key) ARE hashed. When the classifier or the
 * dedupe key logic changes, every affected row then counts as changed and is rewritten with
 * the new value on its next run, with no separate backfill.
 */
type HashedFields = Omit<JobRow, "raw" | "content_hash">;

/** JSON with object keys sorted, so property order cannot change the hash. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function contentHash(fields: HashedFields): string {
  return createHash("sha256").update(stableStringify(fields)).digest("hex");
}
