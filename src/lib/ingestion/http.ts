// fetch with a per-attempt timeout and retries for transient failures.
//
// Retried: network errors, timeouts, 429 and 5xx. These say "try again later".
// Not retried: other 4xx. A 404 or 400 will not change on a second attempt, and retrying it
// only adds load to someone else's API.

export const USER_AGENT =
  "remote-tech-jobs/0.1 (+https://github.com/soyjoysauce/remote-tech-jobs)";

export type FetchImpl = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface RetryOptions {
  /** Injected so tests never touch the network. */
  fetchImpl?: FetchImpl;
  /** Abort one attempt after this many ms. Default 20 s. */
  timeoutMs?: number;
  /** Retries after the first attempt. Default 3, so at most 4 requests. */
  maxRetries?: number;
  /** Backoff base: attempt n waits up to baseDelayMs * 2^n. Default 1 s. */
  baseDelayMs?: number;
  /** Upper bound for any single backoff wait. A Retry-After above it makes the call give up
   * instead of retrying early. Default 60 s. */
  maxDelayMs?: number;
  /** Injected so tests do not wait for real. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected so tests get deterministic jitter. Returns [0, 1). */
  random?: () => number;
  /** Used to resolve an HTTP-date Retry-After. */
  now?: () => number;
  headers?: Record<string, string>;
}

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    readonly attempts: number,
  ) {
    super(`GET ${url} failed with HTTP ${status} after ${attempts} attempt(s)`);
    this.name = "HttpError";
  }
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Parses Retry-After, which is either a number of seconds or an HTTP date.
 * Returns ms to wait, or undefined when the header is missing or unparseable.
 */
export function parseRetryAfter(
  value: string | null,
  now: number,
): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

/**
 * "Full jitter" backoff: a random wait between 0 and base * 2^attempt (capped).
 * Without the randomness, many clients that failed together would all retry at the same
 * moment and fail together again.
 */
export function backoffDelay(
  attempt: number,
  opts: Required<Pick<RetryOptions, "baseDelayMs" | "maxDelayMs" | "random">>,
): number {
  const ceiling = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** attempt);
  return Math.floor(opts.random() * ceiling);
}

/**
 * GET a URL, retrying transient failures. Resolves with the successful Response; throws
 * HttpError for a non-retryable status or when retries run out, or the last network error.
 */
export async function fetchWithRetry(
  url: string,
  options: RetryOptions = {},
): Promise<Response> {
  const {
    fetchImpl = fetch,
    timeoutMs = 20_000,
    maxRetries = 3,
    baseDelayMs = 1_000,
    maxDelayMs = 60_000,
    sleep = defaultSleep,
    random = Math.random,
    now = Date.now,
    headers = {},
  } = options;

  for (let attempt = 0; ; attempt++) {
    const attempts = attempt + 1;
    const canRetry = attempt < maxRetries;
    let waitMs: number;

    try {
      // A fresh timeout per attempt: one signal shared across attempts would count the time
      // spent in earlier attempts and backoff waits against the later ones.
      const response = await fetchImpl(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          ...headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (response.ok) return response;

      // Every path below discards the response, so release the connection first: an unread
      // body keeps it open.
      await response.body?.cancel();

      if (!isRetryableStatus(response.status) || !canRetry) {
        throw new HttpError(url, response.status, attempts);
      }

      const retryAfter = parseRetryAfter(
        response.headers.get("retry-after"),
        now(),
      );
      // The server asked us to wait longer than we are willing to. Retrying sooner would ignore
      // its request (and Remotive asks for only a few calls a day), so give up: the next
      // scheduled run tries again.
      if (retryAfter !== undefined && retryAfter > maxDelayMs) {
        throw new HttpError(url, response.status, attempts);
      }
      waitMs =
        retryAfter ??
        backoffDelay(attempt, { baseDelayMs, maxDelayMs, random });
    } catch (error) {
      // HttpError was decided above. Anything else is a network error or a timeout
      // (AbortSignal.timeout rejects with a DOMException named "TimeoutError").
      if (error instanceof HttpError || !canRetry) throw error;
      waitMs = backoffDelay(attempt, { baseDelayMs, maxDelayMs, random });
    }

    await sleep(waitMs);
  }
}
