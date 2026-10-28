// Remote OK adapter.
//
// Terms (from the legal notice in the response): link back to the listing on Remote OK with a
// followed link (no rel="nofollow") and name Remote OK as the source.
//
// The feed returns only a recent window (100 jobs, about 10 weeks), so Remote OK jobs are closed
// by age, never because they are missing (decision 0008).
import { cleanTags, cleanText, fetchJson, httpUrl, toIsoDate } from "./common";
import { htmlToText, sanitizeDescription } from "../html";
import {
  remoteOkEnvelopeSchema,
  remoteOkJobSchema,
  remoteOkLegalNoticeSchema,
  type RemoteOkJob,
} from "../schemas/remoteok";
import type { NormalizedJob, SourceAdapter } from "../types";

export const REMOTEOK_URL = "https://remoteok.com/api";

/**
 * Repairs UTF-8 text that was decoded as Latin-1 somewhere upstream ("MÃ©xico" -> "México",
 * "bonuses.Â " -> "bonuses. "). Remote OK's feed has this in about a third of its descriptions.
 *
 * Only applied when the text could be mojibake: every character fits in one Latin-1 byte (real
 * text with characters beyond Latin-1 is left alone) and a typical lead-byte pair is present.
 * The re-decoded text is used only if it is valid UTF-8 (no U+FFFD replacement characters).
 */
export function repairMojibake(text: string): string {
  if (!/[\u00c2-\u00f4][\u0080-\u00bf]/.test(text)) return text;
  if (/[^\u0000-\u00ff]/.test(text)) return text;
  const repaired = Buffer.from(text, "latin1").toString("utf8");
  return repaired.includes("\ufffd") ? text : repaired;
}

function repairNullable(
  text: string | null | undefined,
): string | null | undefined {
  return text == null ? text : repairMojibake(text);
}

export const remoteOkAdapter: SourceAdapter<RemoteOkJob> = {
  id: "remoteok",
  closeStrategy: { kind: "max_age", maxAgeDays: 30 },

  async fetchJobs({ fetchImpl }) {
    const body = await fetchJson(REMOTEOK_URL, fetchImpl);
    const items = remoteOkEnvelopeSchema.parse(body);
    // The first element is the legal notice, not a job. Matched by shape rather than dropped by
    // position, so a feed without the notice does not lose its first job.
    return items.filter(
      (item) => !remoteOkLegalNoticeSchema.safeParse(item).success,
    );
  },

  itemSchema: remoteOkJobSchema,

  normalize(job): NormalizedJob {
    const descriptionHtml = sanitizeDescription(
      repairNullable(job.description),
    );
    // 0 means "not given". A min above the max would violate jobs_salary_range_check and fail
    // the whole batch, so an inconsistent pair is dropped.
    const min = job.salary_min ? job.salary_min : null;
    const max = job.salary_max ? job.salary_max : null;
    const consistent = min === null || max === null || min <= max;
    const salaryMin = consistent ? min : null;
    const salaryMax = consistent ? max : null;
    const hasSalary = salaryMin !== null || salaryMax !== null;

    // itemSchema already guarantees job.url is an absolute http(s) URL (schemas/common.ts), so
    // the fallback never runs; httpUrl is used to normalize it ("remoteOK.com" -> "remoteok.com").
    const sourceUrl = httpUrl(job.url) ?? job.url;
    return {
      source_id: "remoteok",
      external_id: job.id,
      company_name: repairMojibake(job.company),
      title: repairMojibake(job.position),
      description_html: descriptionHtml,
      description_text: htmlToText(descriptionHtml),
      // Often points back to remoteok.com rather than the employer (all 99 jobs in the
      // 2026-10-14 response did). Falls back to the listing URL when missing or not http(s),
      // so a javascript: or data: apply link from the feed is never stored.
      apply_url: httpUrl(job.apply_url) ?? sourceUrl,
      source_url: sourceUrl,
      location_raw: cleanText(repairNullable(job.location)),
      source_remote_flag: true,
      employment_type: null,
      department: null,
      tags: cleanTags(job.tags?.map(repairMojibake)),
      salary_min: salaryMin,
      salary_max: salaryMax,
      // Remote OK's salary fields are annual USD.
      salary_currency: hasSalary ? "USD" : null,
      salary_period: hasSalary ? "year" : null,
      posted_at: toIsoDate(job.date),
    };
  },
};
