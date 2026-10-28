import { describe, expect, it, vi } from "vitest";

import {
  backoffDelay,
  fetchWithRetry,
  HttpError,
  parseRetryAfter,
  USER_AGENT,
  type FetchImpl,
} from "./http";

function respond(
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(status === 200 ? "{}" : "error", { status, headers });
}

/** A fetch stub that returns (or throws) the given results in order. */
function sequence(...results: Array<Response | Error>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: FetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = results[calls.length - 1];
    if (next === undefined) throw new Error("unexpected extra request");
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchImpl, calls };
}

const fastOptions = { sleep: async () => {}, random: () => 0.5 };

describe("fetchWithRetry", () => {
  it("returns the first successful response and sends the User-Agent", async () => {
    const { fetchImpl, calls } = sequence(respond(200));
    const response = await fetchWithRetry("https://api.test/jobs", {
      fetchImpl,
      ...fastOptions,
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(new Headers(calls[0]?.init?.headers).get("User-Agent")).toBe(
      USER_AGENT,
    );
  });

  it("retries a 503 and then succeeds", async () => {
    const { fetchImpl, calls } = sequence(
      respond(503),
      respond(503),
      respond(200),
    );
    const response = await fetchWithRetry("https://api.test/jobs", {
      fetchImpl,
      ...fastOptions,
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(3);
  });

  it("does not retry a 404", async () => {
    const { fetchImpl, calls } = sequence(respond(404));
    await expect(
      fetchWithRetry("https://api.test/jobs", { fetchImpl, ...fastOptions }),
    ).rejects.toMatchObject({
      name: "HttpError",
      status: 404,
      attempts: 1,
    });
    expect(calls).toHaveLength(1);
  });

  it("gives up after maxRetries and reports the last status", async () => {
    const { fetchImpl, calls } = sequence(
      respond(500),
      respond(502),
      respond(503),
    );
    const error = await fetchWithRetry("https://api.test/jobs", {
      fetchImpl,
      maxRetries: 2,
      ...fastOptions,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 503, attempts: 3 });
    expect(calls).toHaveLength(3);
  });

  it("honors Retry-After seconds on a 429", async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl } = sequence(
      respond(429, { "Retry-After": "7" }),
      respond(200),
    );
    await fetchWithRetry("https://api.test/jobs", {
      fetchImpl,
      sleep,
      random: () => 0.5,
    });

    expect(sleep).toHaveBeenCalledWith(7_000);
  });

  it("gives up instead of retrying early when Retry-After exceeds maxDelayMs", async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl, calls } = sequence(
      respond(429, { "Retry-After": "3600" }),
      respond(200),
    );
    await expect(
      fetchWithRetry("https://api.test/jobs", {
        fetchImpl,
        sleep,
        maxDelayMs: 30_000,
      }),
    ).rejects.toMatchObject({ name: "HttpError", status: 429, attempts: 1 });

    // One request, no waiting: the server asked for an hour, so we do not come back in 30 s.
    expect(calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("releases the response body before throwing on a non-retryable status", async () => {
    const response = respond(404);
    if (!response.body) throw new Error("test response has no body");
    const cancel = vi.spyOn(response.body, "cancel");
    const { fetchImpl } = sequence(response);
    await expect(
      fetchWithRetry("https://api.test/jobs", { fetchImpl, ...fastOptions }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(cancel).toHaveBeenCalled();
  });

  it("retries network errors", async () => {
    const { fetchImpl, calls } = sequence(
      new TypeError("fetch failed"),
      respond(200),
    );
    const response = await fetchWithRetry("https://api.test/jobs", {
      fetchImpl,
      ...fastOptions,
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("aborts an attempt that exceeds the timeout, then retries", async () => {
    let call = 0;
    // The first attempt never resolves on its own; only the abort signal ends it.
    const fetchImpl: FetchImpl = (_url, init) => {
      call++;
      if (call > 1) return Promise.resolve(respond(200));
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      });
    };
    const response = await fetchWithRetry("https://api.test/jobs", {
      fetchImpl,
      timeoutMs: 20,
      ...fastOptions,
    });

    expect(response.status).toBe(200);
    expect(call).toBe(2);
  });

  it("throws the timeout error when no retries are left", async () => {
    const fetchImpl: FetchImpl = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      });
    await expect(
      fetchWithRetry("https://api.test/jobs", {
        fetchImpl,
        timeoutMs: 20,
        maxRetries: 0,
        ...fastOptions,
      }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
  });
});

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-10-14T12:00:00Z");

  it("parses seconds", () => {
    expect(parseRetryAfter("120", now)).toBe(120_000);
  });

  it("parses an HTTP date relative to now", () => {
    expect(parseRetryAfter("Wed, 14 Oct 2026 12:00:30 GMT", now)).toBe(30_000);
  });

  it("returns 0 for a date in the past", () => {
    expect(parseRetryAfter("Wed, 14 Oct 2026 11:00:00 GMT", now)).toBe(0);
  });

  it("returns undefined for a missing or garbage header", () => {
    expect(parseRetryAfter(null, now)).toBeUndefined();
    expect(parseRetryAfter("soon", now)).toBeUndefined();
  });
});

describe("backoffDelay", () => {
  it("grows exponentially and stays under the cap", () => {
    const opts = { baseDelayMs: 1_000, maxDelayMs: 5_000, random: () => 0.999 };
    expect(backoffDelay(0, opts)).toBe(999);
    expect(backoffDelay(1, opts)).toBe(1_998);
    expect(backoffDelay(10, opts)).toBe(4_995);
  });
});
