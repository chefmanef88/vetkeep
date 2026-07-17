import { afterEach, describe, expect, it } from "vitest";
import { getPublicEnv } from "./env";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getPublicEnv", () => {
  it("returns validated public configuration", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key_1234567890";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    expect(getPublicEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key_1234567890",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000"
    });
  });

  it("rejects missing Supabase configuration", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(() => getPublicEnv()).toThrow();
  });
});
