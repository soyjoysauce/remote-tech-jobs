// Remote OK API response: https://remoteok.com/api
//
// A top-level array whose first element is a legal notice ({ last_updated, legal }), followed
// by jobs. Same two-level validation as Remotive: the envelope must be an array or the run
// fails; each job is validated on its own.
import { z } from "zod";

import { httpUrlSchema, sourceDateSchema } from "./common";

export const remoteOkEnvelopeSchema = z.array(z.unknown());

/** The legal notice element: it has a `legal` key and no job fields. */
export const remoteOkLegalNoticeSchema = z.object({ legal: z.string() });

export const remoteOkJobSchema = z.object({
  // A numeric string in practice ("1137512"). Coerced so a switch to numbers is not a breaking change.
  id: z.union([z.string().min(1), z.number().int()]).transform(String),
  url: httpUrlSchema,
  position: z.string().trim().min(1),
  company: z.string().trim().min(1),
  // ISO 8601 with offset, e.g. "2026-10-14T01:31:49+00:00".
  date: sourceDateSchema,
  location: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  description: z.string().nullish(),
  // 0 means "not given".
  salary_min: z.number().nonnegative().nullish(),
  salary_max: z.number().nonnegative().nullish(),
  apply_url: z.string().nullish(),
});

export type RemoteOkJob = z.infer<typeof remoteOkJobSchema>;
