import * as ExpoCrypto from "expo-crypto";

/**
 * Hermes ships no Web Crypto, so `globalThis.crypto` is undefined on device.
 *
 * This is not a mobile-only detail to paper over at each call site. Every
 * record id is generated on the client so a visit written offline keeps the
 * same identity once it syncs, and generateClientCode in @vetkeep/domain draws
 * its entropy from getRandomValues. Both of those are shared with the web app,
 * where the browser supplies crypto for free. Restoring the two functions the
 * shared code already expects keeps one implementation across both platforms
 * rather than forking id generation per target.
 *
 * Import for the side effect, before anything that might reach for them.
 */

type CryptoSurface = {
  randomUUID?: () => string;
  getRandomValues?: (array: ArrayBufferView) => ArrayBufferView;
};

const scope = globalThis as typeof globalThis & { crypto?: CryptoSurface };

if (!scope.crypto) {
  // defineProperty rather than assignment: on some runtimes `crypto` is an
  // accessor with no setter, where a plain assignment fails silently.
  Object.defineProperty(scope, "crypto", {
    value: {} as CryptoSurface,
    configurable: true,
    writable: true
  });
}

const target = scope.crypto as CryptoSurface;

// Each guarded separately. A runtime that supplies one of these but not the
// other keeps its own, which is always the better implementation than ours.
if (typeof target.randomUUID !== "function") {
  target.randomUUID = () => ExpoCrypto.randomUUID();
}

if (typeof target.getRandomValues !== "function") {
  target.getRandomValues = (array) =>
    ExpoCrypto.getRandomValues(array as Parameters<typeof ExpoCrypto.getRandomValues>[0]);
}
