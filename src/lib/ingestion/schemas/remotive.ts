// Remotive API response: https://remotive.com/api/remote-jobs
//
// Validated in two levels. The envelope must match or the run fails: a different envelope means
// the API changed and nothing in it can be trusted. Each job is then validated on its own, so a
// single malformed job is counted and skipped instead of failing the whole run.
import { z } from "zod";

import { httpUrlSchema, sourceDateSchema } from "./common";

export const remotiveEnvelopeSchema = z.object({
  jobs: z.array(z.unknown()),
});

export const remotiveJobSchema = z.object({
  id: z.number().int().positive(),
  url: httpUrlSchema,
  title: z.string().trim().min(1),
  company_name: z.string().trim().min(1),
  category: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  job_type: z.string().nullish(),
  // ISO 8601 without a timezone, e.g. "2026-10-11T20:17:27" (UTC in practice).
  publication_date: sourceDateSchema,
  candidate_required_location: z.string().nullish(),
  // Free text ("$35,3k- $52k"), so it is kept in raw and not parsed.
  salary: z.string().nullish(),
  description: z.string().nullish(),
});

export type RemotiveJob = z.infer<typeof remotiveJobSchema>;
