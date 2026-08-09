/**
 * Working out a date of birth from what an owner actually says.
 *
 * On a house call the answer is rarely a date. It is "about three years", or
 * "she was a puppy last Christmas", or a shrug. The patients table carries
 * date_of_birth_precision for exactly this reason, so the three answers are
 * recorded as three different kinds of fact rather than one being dressed up as
 * another. An age given as approximate must never be stored as though the
 * owner produced a certificate: dosing and vaccination intervals are read off
 * this later, and a false precision is worse than an admitted estimate.
 *
 * Kept apart from the screen so the arithmetic can be tested without a device,
 * and so no date picker is needed — one would be a native module, and adding a
 * native module means rebuilding the app.
 */

export type DobMode = "exact" | "estimated" | "unknown";

export type DobResolution =
  { ok: true; date: string | null; precision: DobMode } | { ok: false; message: string };

export type DobInput = {
  mode: DobMode;
  /** ISO-shaped text for an exact date: 2023-04-17. */
  exactText: string;
  /** Whole years, as spoken. */
  years: string;
  /** Additional months, for animals under a year or a more careful owner. */
  months: string;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseCount(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function resolveDateOfBirth(input: DobInput, today = new Date()): DobResolution {
  if (input.mode === "unknown") {
    // No date at all. Storing today, or a guess, would be a fabricated fact.
    return { ok: true, date: null, precision: "unknown" };
  }

  const midnight = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );

  if (input.mode === "exact") {
    const match = ISO_DATE.exec(input.exactText.trim());
    if (!match) {
      return {
        ok: false,
        message: "Write the date of birth as YYYY-MM-DD, for example 2023-04-17."
      };
    }

    const [, year, month, day] = match;
    const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

    // Round-trip check. Date.UTC rolls 31 February forward into March rather
    // than rejecting it, so a plain construction would silently accept it.
    const roundTrips =
      candidate.getUTCFullYear() === Number(year) &&
      candidate.getUTCMonth() === Number(month) - 1 &&
      candidate.getUTCDate() === Number(day);
    if (!roundTrips) return { ok: false, message: "That date does not exist." };

    if (candidate.getTime() > midnight.getTime()) {
      return { ok: false, message: "A date of birth cannot be in the future." };
    }

    return { ok: true, date: toIsoDate(candidate), precision: "exact" };
  }

  const years = parseCount(input.years);
  const months = parseCount(input.months);
  if (years === null || months === null) {
    return { ok: false, message: "Give the age in whole years and months." };
  }
  if (years === 0 && months === 0) {
    return { ok: false, message: "Give an age, or record the date of birth as unknown." };
  }

  const born = new Date(
    Date.UTC(
      midnight.getUTCFullYear() - years,
      midnight.getUTCMonth() - months,
      midnight.getUTCDate()
    )
  );

  return { ok: true, date: toIsoDate(born), precision: "estimated" };
}
