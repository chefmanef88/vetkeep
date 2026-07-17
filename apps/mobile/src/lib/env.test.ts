import { afterEach, describe, expect, it } from "vitest";
import { getMobileEnv } from "./env";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getMobileEnv", () => {
  it("returns configured Supabase values", () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test_key_1234567890";
    expect(getMobileEnv()).toEqual({
      url: "http://127.0.0.1:54321",
      key: "sb_publishable_test_key_1234567890"
    });
  });

  it("throws when configuration is incomplete", () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(() => getMobileEnv()).toThrow("Missing Expo Supabase environment variables");
  });
});
