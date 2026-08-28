import * as SecureStore from "expo-secure-store";
import { getMobileEnv } from "@/lib/env";

/**
 * The public health passport, from the veterinarian's side (brief §10).
 *
 * The token is minted here and only ever sent to the server to be hashed. That
 * has one consequence worth stating plainly: this device holds the only copy of
 * the raw token, so it is kept in the secure store rather than ordinary
 * storage, and losing it means rotating rather than recovering.
 *
 * That is the correct behaviour for a secret, not a defect. It is also why
 * rotation exists, and why the screen warns that rotating kills every QR code
 * already printed.
 */

const TOKEN_PREFIX = "vetkeep.passport.";

/**
 * The URL the QR code encodes.
 *
 * Read through getMobileEnv rather than from the variable directly. This file
 * carried its own copy of the same lookup and the same fallback, and the two
 * are exactly the kind of pair that drifts: when the fallback here was wrong it
 * produced a valid token at an address that does not answer, which is a broken
 * link in a client's hand and looks like nothing at all from this end.
 *
 * Resolved per call, not at module load, so importing this file cannot throw
 * before the environment has been read.
 */
function baseUrl(): string {
  return getMobileEnv().webBaseUrl;
}

/**
 * Thirty-two URL-safe characters from a cryptographic source — around 190 bits.
 *
 * The alphabet is deliberately not the Crockford one used for record codes.
 * Those are read aloud down a telephone and drop the letters that get misheard;
 * this is never read aloud, it is scanned, so it spends its entropy instead.
 */
export function generatePassportToken(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);

  let token = "";
  for (const byte of bytes) {
    token += alphabet[byte % alphabet.length];
  }
  return token;
}

export function passportUrl(token: string): string {
  return `${baseUrl()}/passport/${token}`;
}

export async function savePassportToken(patientId: string, token: string): Promise<void> {
  await SecureStore.setItemAsync(`${TOKEN_PREFIX}${patientId}`, token);
}

export async function readPassportToken(patientId: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(`${TOKEN_PREFIX}${patientId}`);
  } catch {
    // A secure store that will not open is the same as no token: the vet is
    // told to rotate, which is the only honest recovery.
    return null;
  }
}

export async function clearPassportToken(patientId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(`${TOKEN_PREFIX}${patientId}`);
  } catch {
    // Nothing to do. The server copy is what governs whether the link works.
  }
}
