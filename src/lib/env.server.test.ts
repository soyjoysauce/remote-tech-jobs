import { describe, expect, it } from "vitest";

import { getServerEnv } from "./env.server";

describe("getServerEnv", () => {
  it("returns the variables when they are valid", () => {
    const env = getServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
      SUPABASE_SECRET_KEY: "sb_secret_test",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:55321");
  });

  it("lists every problem in one error", () => {
    expect(() =>
      getServerEnv({ NEXT_PUBLIC_SUPABASE_URL: "not a url" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL[\s\S]*SUPABASE_SECRET_KEY/);
  });

  it("never includes a value in the error message", () => {
    const secret = "sb_secret_do_not_print";
    try {
      getServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "nope",
        SUPABASE_SECRET_KEY: secret,
      });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
