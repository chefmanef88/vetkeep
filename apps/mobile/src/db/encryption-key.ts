/**
 * The key the local clinical database is encrypted with.
 *
 * Brief 5.1 requires the local clinical database encrypted, and requires
 * secrets to live only in the operating system's secure credential store. So
 * the keychain holds the key and SQLCipher holds the data — which is what the
 * keychain-only queue was standing in for while there was no database.
 *
 * Generated once per install and never leaves the device. There is no recovery
 * path on purpose: losing it means losing local cache, and local cache is a
 * copy of the server's records, not the record of truth. 5.1 says the same
 * thing about the local PIN — recovery must not weaken the encryption.
 */

import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const KEY_NAME = "vetkeep.db.key";

/** 32 bytes, SQLCipher's raw key length, as 64 hex characters. */
const KEY_BYTES = 32;

export const RAW_KEY_PATTERN = /^[0-9a-f]{64}$/;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Returns the device's database key, creating it on first call.
 *
 * `requireAuthentication` is deliberately not set. The database is opened while
 * the app starts, before the biometric gate; the gate is what 5.1 requires in
 * front of the records, and it is enforced in the app rather than by making the
 * key unreadable. Making this key biometric-gated would mean the app cannot
 * open its own queue to retry a send in the background.
 */
export async function getOrCreateDatabaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing && RAW_KEY_PATTERN.test(existing)) return existing;

  // A stored value that is not a valid raw key cannot be used and cannot be
  // recovered from, so it is replaced rather than passed to SQLCipher.
  const fresh = toHex(Crypto.getRandomBytes(KEY_BYTES));
  await SecureStore.setItemAsync(KEY_NAME, fresh);
  return fresh;
}

/**
 * Forgets the key, which makes the encrypted database permanently unreadable.
 *
 * This is the "clear local tenant data" half of 5.1. The database file is
 * deleted alongside it; this exists so that a file which survives deletion —
 * in a backup, in a forensic image — is still ciphertext with no key.
 */
export async function forgetDatabaseKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_NAME);
}
