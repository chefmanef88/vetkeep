import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The device has no globalThis.crypto, the test runner does. So every test here
 * removes it first: a suite that runs against Node's own crypto proves nothing
 * about the phone, which is exactly how randomUUID reached a device undefined.
 */
const realCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");

vi.mock("expo-crypto", () => ({
  randomUUID: () => "11111111-2222-4333-8444-555555555555",
  getRandomValues: (array: Uint8Array) => {
    for (let index = 0; index < array.length; index += 1) array[index] = index % 256;
    return array;
  }
}));

function removeGlobalCrypto() {
  Object.defineProperty(globalThis, "crypto", {
    value: undefined,
    configurable: true,
    writable: true
  });
}

beforeEach(() => {
  vi.resetModules();
  removeGlobalCrypto();
});

afterEach(() => {
  if (realCrypto) Object.defineProperty(globalThis, "crypto", realCrypto);
});

describe("crypto polyfill", () => {
  it("supplies randomUUID where the runtime has none", async () => {
    expect(globalThis.crypto).toBeUndefined();
    await import("./crypto");
    expect(globalThis.crypto.randomUUID()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("supplies getRandomValues, filling the array it is handed", async () => {
    await import("./crypto");
    const bytes = new Uint8Array(6);
    const returned = globalThis.crypto.getRandomValues(bytes);
    expect(returned).toBe(bytes);
    expect([...bytes]).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("lets the shared code generator run, which is why getRandomValues is here", async () => {
    // generateClientCode reaches straight for globalThis.crypto.getRandomValues.
    // It is shared with the web app, so it cannot import expo-crypto itself.
    await import("./crypto");
    const { generateClientCode, CLIENT_CODE_PATTERN } = await import("@vetkeep/domain");
    expect(generateClientCode()).toMatch(CLIENT_CODE_PATTERN);
  });

  it("keeps an implementation the runtime already provides", async () => {
    const ours = () => "22222222-3333-4444-8555-666666666666";
    Object.defineProperty(globalThis, "crypto", {
      value: { randomUUID: ours },
      configurable: true,
      writable: true
    });

    await import("./crypto");

    expect(globalThis.crypto.randomUUID).toBe(ours);
    // and still fills in the half that was missing
    expect(typeof globalThis.crypto.getRandomValues).toBe("function");
  });
});
