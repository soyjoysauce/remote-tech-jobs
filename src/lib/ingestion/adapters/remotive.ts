// Remotive adapter.
//
// Terms (from the API's legal notice): link back to the job's Remotive URL and name Remotive as
// the source; call the API at most about 4 times a day. Jobs are delayed by 24 hours.
//
// The free API returns only the most recent jobs (15 when checked on 2026-10-14) and ignores
// the category parameter. The category stays in the URL to state intent, but the tech
// classifier does the filtering. Because the feed is a window, not every active job, Remotive
// jobs are closed by age, never because they are missing (decision 0008).
import { cleanTags, cleanText, fetchJson, toIsoDate } from "./common";
import { htmlToText, sanitizeDescription } from "../html";
import {
  remotiveEnvelopeSchema,
  remotiveJobSchema,
  type RemotiveJob,
} from "../schemas/remotive";
import type { EmploymentType, NormalizedJob, SourceAdapter } from "../types";

export const REMOTIVE_URL =
  "https://remotive.com/api/remote-jobs?category=software-dev";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function toEmploymentType(
  jobType: string | null | undefined,
): EmploymentType | null {
  switch (jobType) {
    case "full_time":
    case "part_time":
    case "contract":
    case "internship":
      return jobType;
    case "freelance":
      return "contract";
    case null:
    case undefined:
    case "":
      return null;
    default:
      return "other";
  }
}

export const remotiveAdapter: SourceAdapter<RemotiveJob> = {
  id: "remotive",
  closeStrategy: { kind: "max_age", maxAgeDays: 30 },
  // Four runs a day at most, matching Remotive's request.
  minIntervalMs: SIX_HOURS_MS,

  async fetchJobs({ fetchImpl }) {
    const body = await fetchJson(REMOTIVE_URL, fetchImpl);
    // parse(), not safeParse(): a wrong envelope must fail the run.
    return remotiveEnvelopeSchema.parse(body).jobs;
  },

  itemSchema: remotiveJobSchema,

  normalize(job): NormalizedJob {
    const descriptionHtml = sanitizeDescription(job.description);
    return {
      source_id: "remotive",
      external_id: String(job.id),
      company_name: job.company_name,
      title: job.title,
      description_html: descriptionHtml,
      description_text: htmlToText(descriptionHtml),
      // Remotive has no separate employer link: applying starts on the Remotive page, which is
      // also the attribution link-back.
      // job.url is guaranteed http(s) by itemSchema (schemas/common.ts).
      apply_url: job.url,
      source_url: job.url,
      location_raw: cleanText(job.candidate_required_location),
      source_remote_flag: true,
      employment_type: toEmploymentType(job.job_type),
      department: cleanText(job.category),
      tags: cleanTags(job.tags),
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      salary_period: null,
      posted_at: toIsoDate(job.publication_date),
    };
  },
};
