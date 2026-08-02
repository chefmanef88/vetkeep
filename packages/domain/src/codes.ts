// Human-readable record codes, per brief 4.1.
//
// Codes are generated on the device, offline, and must not collide when two
// devices create records without seeing each other. A sequential counter cannot
// satisfy that, so the random segment carries the uniqueness.
//
// The alphabet is Crockford Base32: the digits plus the uppercase letters with
// I, L, O and U removed. I/L/O are dropped because they are misread as 1/1/0
// when a code is read aloud over the phone or copied off a handwritten note,
// which is how these codes actually travel. U is dropped to avoid accidental
// obscenities.

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SEGMENT_LENGTH = 6;

export const CLIENT_CODE_PREFIX = "VK-C-";
export const PATIENT_CODE_PREFIX = "VK-P-";

export const CLIENT_CODE_PATTERN = /^VK-C-[0-9A-HJKMNP-TV-Z]{6}$/;
export const PATIENT_CODE_PATTERN = /^VK-P-[0-9A-HJKMNP-TV-Z]{6}$/;

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Six Crockford Base32 characters, drawn from a cryptographic source.
 *
 * 32 divides 256 evenly, so a plain modulo is already uniform here. The
 * rejection guard is kept anyway: it costs nothing, and it keeps the
 * distribution uniform rather than silently biased if the alphabet is ever
 * shortened.
 */
function randomSegment(): string {
  const limit = Math.floor(256 / CROCKFORD_ALPHABET.length) * CROCKFORD_ALPHABET.length;
  let segment = "";

  while (segment.length < SEGMENT_LENGTH) {
    for (const byte of randomBytes(SEGMENT_LENGTH)) {
      if (byte >= limit) continue;
      segment += CROCKFORD_ALPHABET[byte % CROCKFORD_ALPHABET.length];
      if (segment.length === SEGMENT_LENGTH) break;
    }
  }

  return segment;
}

export function generateClientCode(): string {
  return `${CLIENT_CODE_PREFIX}${randomSegment()}`;
}

export function generatePatientCode(): string {
  return `${PATIENT_CODE_PREFIX}${randomSegment()}`;
}

/**
 * Accepts the forms a code arrives in when a person types or pastes it: lower
 * case, surrounding whitespace, and the characters Crockford treats as aliases
 * (I and L for 1, O for zero). Returns null when the result is not a valid code,
 * so callers cannot accidentally treat a rejected value as usable.
 */
export function normalizeRecordCode(input: string): string | null {
  const candidate = input.trim().toUpperCase().replace(/[IL]/g, "1").replace(/O/g, "0");

  if (CLIENT_CODE_PATTERN.test(candidate) || PATIENT_CODE_PATTERN.test(candidate)) {
    return candidate;
  }
  return null;
}
