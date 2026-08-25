import * as SecureStore from "expo-secure-store";

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
 * Configurable because the web application is not deployed at its production
 * domain yet. Until it is, a passport link is a valid, working token pointing
 * at a host that does not answer — the token is real, the address is not.
 */
const BASE_URL = (process.env["EXPO_PUBLIC_PASSPORT_BASE_URL"] ?? "https://vetkeep.app").replace(
  /\/+$/,
  ""
);

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
  return `${BASE_URL}/passport/${token}`;
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
