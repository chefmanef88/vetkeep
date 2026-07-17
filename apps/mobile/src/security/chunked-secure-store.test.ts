import { beforeEach, describe, expect, it, vi } from "vitest";

const values = new Map<string, string>();
const getItemAsync = vi.fn(async (key: string) => values.get(key) ?? null);
const setItemAsync = vi.fn(async (key: string, value: string) => {
  values.set(key, value);
});
const deleteItemAsync = vi.fn(async (key: string) => {
  values.delete(key);
});

vi.mock("expo-secure-store", () => ({
  getItemAsync,
  setItemAsync,
  deleteItemAsync,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY"
}));

const { chunkedSecureStore } = await import("./chunked-secure-store");

beforeEach(() => {
  values.clear();
  vi.clearAllMocks();
});

describe("chunkedSecureStore", () => {
  it("stores small values as one secure item", async () => {
    await chunkedSecureStore.setItem("session", "small-value");
    expect(values.get("session")).toBe("small-value");
    expect(values.has("session:chunks")).toBe(false);
    await expect(chunkedSecureStore.getItem("session")).resolves.toBe("small-value");
  });

  it("chunks and reconstructs large values", async () => {
    const value = "x".repeat(4000);
    await chunkedSecureStore.setItem("session", value);
    expect(values.get("session:chunks")).toBe("3");
    await expect(chunkedSecureStore.getItem("session")).resolves.toBe(value);
  });

  it("returns null when a chunk is missing and removes all stored pieces", async () => {
    await chunkedSecureStore.setItem("session", "x".repeat(4000));
    values.delete("session:1");
    await expect(chunkedSecureStore.getItem("session")).resolves.toBeNull();

    await chunkedSecureStore.removeItem("session");
    expect([...values.keys()].filter((key) => key.startsWith("session"))).toEqual([]);
  });
});
