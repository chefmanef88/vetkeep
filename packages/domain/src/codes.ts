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
export const RECORD_CODE_PREFIX = "VK-R-";

export const CLIENT_CODE_PATTERN = /^VK-C-[0-9A-HJKMNP-TV-Z]{6}$/;
export const PATIENT_CODE_PATTERN = /^VK-P-[0-9A-HJKMNP-TV-Z]{6}$/;
export const RECORD_CODE_PATTERN = /^VK-R-[0-9A-HJKMNP-TV-Z]{6}$/;

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
 * The reference on a consultation record.
 *
 * A record handed to a client needs something both parties can name over the
 * telephone. The patient code plus the date was doing that job and collides:
 * an animal seen morning and evening on a farm visit produces two documents
 * with the same reference, and "the record from the third" stops identifying
 * anything. This is minted per record, like the client and patient series.
 */
export function generateVisitRecordCode(): string {
  return `${RECORD_CODE_PREFIX}${randomSegment()}`;
}

/**
 * The unique constraints that a repeated code lands on. Scoped per veterinarian
 * — two practices never see each other's documents — so these fire on a
 * collision inside one practice's own series.
 */
const CODE_CONSTRAINTS = [
  "clients_vet_id_client_code_key",
  "patients_vet_id_patient_code_key",
  "visits_vet_record_code_idx"
];

/** PostgreSQL unique_violation. */
const UNIQUE_VIOLATION = "23505";

/** The code this project uses for a collision, in place of the raw SQLSTATE. */
export const CODE_TAKEN = "code_taken";

export const CODE_TAKEN_MESSAGE =
  "This reference is already used by another record in your practice.";

/**
 * Whether a failed write is a repeated code rather than any other rejection.
 *
 * 32^6 is a little over a billion, so this is rare but not never: a practice
 * that accumulates thirty thousand records has about a one in three chance of
 * seeing it once. It matters because it is the only rejection that succeeds if
 * simply sent again with a different code — every other one (revoked device,
 * suspended account, failed validation) is settled and resending changes
 * nothing.
 */
export function isCodeCollision(error: {
  code?: string | undefined;
  message?: string | undefined;
  details?: string | null | undefined;
}): boolean {
  if (error.code !== UNIQUE_VIOLATION) return false;

  // PostgREST puts the constraint name in the message and the offending values
  // in the details. Checking both means a change to either alone is survivable.
  const haystack = `${error.message ?? ""} ${error.details ?? ""}`;
  return CODE_CONSTRAINTS.some((constraint) => haystack.includes(constraint));
}

/**
 * Performs a write that carries a freshly minted code, retrying with a new one
 * if that code was already taken.
 *
 * Only safe where the code has not yet left the device — that is, at the moment
 * of creation, before it has been shown, printed or read out. A code that has
 * already reached a client must not be swapped silently: the paper in their
 * hand would stop matching the record. The offline queue therefore does not use
 * this and asks the veterinarian instead.
 */
export async function callWithFreshCode<E extends { code?: string | undefined; message: string }>(
  mint: () => string,
  // PromiseLike rather than Promise: supabase-js returns a thenable builder,
  // not a Promise, and awaiting it is the only thing done with it here.
  call: (code: string) => PromiseLike<{ error: E | null }>,
  attempts = 3
): Promise<{ error: E | null }> {
  let result = await call(mint());

  for (let attempt = 1; attempt < attempts; attempt += 1) {
    if (!result.error || !isCodeCollision(result.error)) return result;
    result = await call(mint());
  }

  return result;
}

/**
 * Accepts the forms a code arrives in when a person types or pastes it: lower
 * case, surrounding whitespace, and the characters Crockford treats as aliases
 * (I and L for 1, O for zero). Returns null when the result is not a valid code,
 * so callers cannot accidentally treat a rejected value as usable.
 */
export function normalizeRecordCode(input: string): string | null {
  const candidate = input.trim().toUpperCase().replace(/[IL]/g, "1").replace(/O/g, "0");

  if (
    CLIENT_CODE_PATTERN.test(candidate) ||
    PATIENT_CODE_PATTERN.test(candidate) ||
    RECORD_CODE_PATTERN.test(candidate)
  ) {
    return candidate;
  }
  return null;
}
