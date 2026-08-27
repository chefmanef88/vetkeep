// Age from a date of birth, said the way a veterinarian says it.
//
// The date of birth is what gets recorded, because it does not change. Age is
// what the clinician actually reasons with — dose bands, vaccination schedules,
// whether a dental is reasonable — and working it out from a date in the middle
// of a consultation is arithmetic nobody should be doing by hand.
//
// The unit moves with the animal. Days for a newborn lamb, weeks for a litter,
// months for a growing heifer, years for an adult dog. A single unit would be
// wrong at one end or the other: "0 months" for a three-day-old kid is useless,
// and "4,015 days" for an adult is worse.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Precision as stored on the folder. An estimate is never shown as a fact. */
export type DateOfBirthPrecision = "exact" | "estimated" | "unknown";

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Age as a phrase, or null when there is no usable date.
 *
 * `asOf` is required rather than defaulted to the current time so this stays a
 * pure function: it can be tested at a fixed date, and a component that renders
 * it is not reading the clock while rendering.
 */
export function describeAge(
  dateOfBirth: string | null | undefined,
  precision: string | null | undefined,
  asOf: Date
): string | null {
  if (!dateOfBirth) return null;

  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return null;

  // Compared at day resolution: a birth stored as a date has no time of day,
  // and treating it as midnight would make an animal born this morning
  // "-1 days" in a timezone behind UTC.
  const bornDay = Date.UTC(born.getFullYear(), born.getMonth(), born.getDate());
  const nowDay = Date.UTC(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  const days = Math.floor((nowDay - bornDay) / DAY_MS);

  // A date in the future is a typo, not a negative age. Say nothing rather than
  // something absurd; the date itself is still displayed beside this.
  if (days < 0) return null;

  const spoken = phrase(born, asOf, days);

  return precision === "exact" ? spoken : `about ${spoken}`;
}

function phrase(born: Date, asOf: Date, days: number): string {
  if (days === 0) return "born today";
  if (days < 14) return plural(days, "day");
  // Up to about two months, weeks are the working unit — it is how litters,
  // broiler flocks and vaccination intervals are all counted.
  if (days < 56) return plural(Math.floor(days / 7), "week");

  let months = (asOf.getFullYear() - born.getFullYear()) * 12 + (asOf.getMonth() - born.getMonth());
  if (asOf.getDate() < born.getDate()) months -= 1;

  const years = Math.floor(months / 12);
  const remainder = months % 12;

  if (years === 0) return plural(months, "month");
  if (remainder === 0) return plural(years, "year");
  return `${years}y ${remainder}m`;
}

/**
 * Age of a group, which is recorded in weeks rather than as a date: a flock
 * hatches together and nobody records a birthday for it.
 *
 * Weeks stay the headline because that is the unit the work uses — broilers go
 * at six weeks, and "about 1 month" would be a step backwards. Past about six
 * months the number stops being readable, so a longer-lived herd gets the
 * translation alongside it rather than instead of it.
 */
export function describeGroupAge(weeks: number | null | undefined): string | null {
  if (weeks === null || weeks === undefined || !Number.isFinite(weeks) || weeks < 0) return null;

  const label = plural(weeks, "week");
  if (weeks < 26) return label;

  const months = Math.round(weeks / 4.345);
  if (months < 24) return `${label} (about ${plural(months, "month")})`;

  const years = Math.floor(months / 12);
  const remainder = months % 12;
  const longer = remainder === 0 ? plural(years, "year") : `${years}y ${remainder}m`;
  return `${label} (about ${longer})`;
}
