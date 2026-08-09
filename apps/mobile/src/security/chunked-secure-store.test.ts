import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The mock enforces SecureStore's real key rule.
 *
 * An earlier version stored into a plain Map, which accepts anything. That is
 * why a colon separator passed every test here and then failed on the first
 * read from a real device: the store rejects any key outside alphanumerics,
 * ".", "-" and "_". A double that is more permissive than the thing it stands
 * in for cannot catch the bugs that matter.
 */
const SECURE_STORE_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

function rejectInvalidKey(key: string) {
  if (!SECURE_STORE_KEY_PATTERN.test(key)) {
    throw new Error(
      'Invalid key provided to SecureStore. Keys must not be empty and contain only alphanumeric characters, ".", "-", and "_".'
    );
  }
}

const values = new Map<string, string>();
const getItemAsync = vi.fn(async (key: string) => {
  rejectInvalidKey(key);
  return values.get(key) ?? null;
});
const setItemAsync = vi.fn(async (key: string, value: string) => {
  rejectInvalidKey(key);
  values.set(key, value);
});
const deleteItemAsync = vi.fn(async (key: string) => {
  rejectInvalidKey(key);
  values.delete(key);
});

vi.mock("expo-secure-store", () => ({
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY"
}));

const { chunkedSecureStore, MAX_VALUE_LENGTH } = await import("./chunked-secure-store");

beforeEach(() => {
  values.clear();
  vi.clearAllMocks();
});

describe("chunkedSecureStore", () => {
  it("stores small values as one secure item", async () => {
    await chunkedSecureStore.setItem("session", "small-value");
    expect(values.get("session")).toBe("small-value");
    await expect(chunkedSecureStore.getItem("session")).resolves.toBe("small-value");
  });

  it("chunks and reconstructs large values", async () => {
    const value = "x".repeat(4000);
    await chunkedSecureStore.setItem("session", value);
    await expect(chunkedSecureStore.getItem("session")).resolves.toBe(value);
  });

  it("returns null when a chunk is missing and removes all stored pieces", async () => {
    await chunkedSecureStore.setItem("session", "x".repeat(4000));
    const chunkKey = [...values.keys()].find((key) => key.includes("__chunk."));
    expect(chunkKey).toBeDefined();
    values.delete(chunkKey as string);
    await expect(chunkedSecureStore.getItem("session")).resolves.toBeNull();

    await chunkedSecureStore.removeItem("session");
    expect([...values.keys()].filter((key) => key.startsWith("session"))).toEqual([]);
  });

  it("only ever derives keys the store will accept", async () => {
    // The regression guard. Every key this module builds, for a chunked value
    // and a plain one, has to satisfy SecureStore's charset.
    await chunkedSecureStore.setItem("sb-abcdefgh-auth-token", "y".repeat(5000));
    await chunkedSecureStore.setItem("vetkeep.sync.outbound", "small");

    expect(values.size).toBeGreaterThan(0);
    for (const key of values.keys()) {
      expect(key).toMatch(SECURE_STORE_KEY_PATTERN);
    }
  });

  it("reads back a chunked value written under a Supabase style key", async () => {
    // Supabase's auth storage is the caller that failed first on device.
    const session = JSON.stringify({ access_token: "z".repeat(4000) });
    await chunkedSecureStore.setItem("sb-abcdefgh-auth-token", session);
    await expect(chunkedSecureStore.getItem("sb-abcdefgh-auth-token")).resolves.toBe(session);
  });

  it("rejects a key the store would refuse, naming the key", async () => {
    await expect(chunkedSecureStore.getItem("has:colon")).rejects.toThrow(/has:colon/);
    await expect(chunkedSecureStore.setItem("has colon", "v")).rejects.toThrow(/secure store key/);
    await expect(chunkedSecureStore.removeItem("")).rejects.toThrow(/secure store key/);
  });

  it("refuses a value larger than it could read back", async () => {
    await expect(
      chunkedSecureStore.setItem("session", "x".repeat(MAX_VALUE_LENGTH + 1))
    ).rejects.toThrow(/above the/);
  });
});
