import { afterEach, describe, expect, it } from "vitest";
import { getMobileEnv } from "./env";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getMobileEnv", () => {
  it("returns configured Supabase values", () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fixture-fixture-fixture";
    process.env["EXPO_PUBLIC_PASSPORT_BASE_URL"] = "https://staging.example.test";
    expect(getMobileEnv()).toEqual({
      url: "http://127.0.0.1:54321",
      key: "fixture-fixture-fixture",
      webBaseUrl: "https://staging.example.test"
    });
  });

  it("trims a trailing slash off the web address", () => {
    // The reset link is built by appending a path, so a configured value with a
    // trailing slash would produce //auth/confirm.
    process.env.EXPO_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fixture-fixture-fixture";
    process.env["EXPO_PUBLIC_PASSPORT_BASE_URL"] = "https://staging.example.test/";
    expect(getMobileEnv().webBaseUrl).toBe("https://staging.example.test");
  });

  it("throws when configuration is incomplete", () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(() => getMobileEnv()).toThrow("Missing Expo Supabase environment variables");
  });
});
