// Small helpers shared by adapters.
import { fetchWithRetry, type FetchImpl } from "../http";

export async function fetchJson(
  url: string,
  fetchImpl?: FetchImpl,
): Promise<unknown> {
  const response = await fetchWithRetry(url, { fetchImpl });
  // Reading the body is outside the retry loop, on purpose: a body that fails mid-read (reset,
  // timeout, invalid JSON) fails this run, which is recorded on its ingestion_runs row, and the
  // next scheduled run tries again. Retrying here would cost rate-limited sources another call.
  return response.json();
}

/**
 * Parses a source date to ISO 8601 UTC, or null when missing or unparseable.
 * A date-time without an offset ("2026-10-11T20:17:27") is read as UTC; JavaScript would
 * otherwise read it as local time, so the same feed would give different values on a laptop
 * and in CI.
 */
export function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const withOffset =
    /T\d{2}:\d{2}/.test(value) && !hasOffset ? `${value}Z` : value;
  const ms = Date.parse(withOffset);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** Trimmed string, or null when empty. */
export function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Lower-cased, trimmed, unique, non-empty tags. */
export function cleanTags(
  tags: readonly string[] | null | undefined,
): string[] {
  return [
    ...new Set((tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean)),
  ];
}

/** Returns the URL normalized (lower-case host) when it is an absolute http(s) URL, else null. */
export function httpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}
