// Field schemas shared by every source.
import { z } from "zod";

import { toIsoDate } from "../adapters/common";

/**
 * An absolute http(s) URL. Plain z.url() also accepts javascript: and data: URLs, and these
 * fields end up as href attributes in Layer 6: a javascript: apply link would be stored XSS.
 * An item whose URL fails this is counted as invalid and skipped.
 */
export const httpUrlSchema = z.url({ protocol: /^https?$/ });

/**
 * A date string the pipeline can parse. An unparseable date would become posted_at = null,
 * which skips the stale filter: an old job would then be reopened and closed on every run.
 */
export const sourceDateSchema = z
  .string()
  .min(1)
  .refine((value) => toIsoDate(value) !== null, {
    message: "unparseable date",
  });
