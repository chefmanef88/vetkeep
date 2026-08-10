/**
 * Vaccines, and which ones belong to which animal.
 *
 * Offering a vet every vaccine for every species turns a two-tap job into a
 * search. A cat is never given DHLPP and a chicken is never given rabies, so
 * the list is filtered by what is in front of them and `other` remains for
 * anything this list has not caught up with.
 *
 * Shared with the database, which constrains the same values. The interface
 * uses this to ask the right question; the database uses its own copy to refuse
 * a wrong answer.
 */

export const VACCINE_TYPES = [
  "dhlpp",
  "anti_rabies",
  "fpl",
  "tricat",
  "newcastle",
  "gumboro",
  "fowl_pox",
  "anthrax",
  "blackleg",
  "cbpp",
  "fmd",
  "ppr",
  "other"
] as const;
export type VaccineType = (typeof VACCINE_TYPES)[number];

export type VaccineProfile = {
  value: VaccineType;
  label: string;
  /** Species this is given to. Empty means it is offered for anything. */
  species: readonly string[];
  /** Months until the next dose is normally due, where there is a usual interval. */
  defaultIntervalMonths: number | null;
};

export const VACCINE_PROFILES: readonly VaccineProfile[] = [
  { value: "dhlpp", label: "DHLPP", species: ["dog"], defaultIntervalMonths: 12 },
  {
    value: "anti_rabies",
    label: "Anti-rabies",
    // Rabies is given to more than dogs, and is the one every owner asks about.
    species: ["dog", "cat", "cattle", "sheep", "goat", "pig", "rabbit"],
    defaultIntervalMonths: 12
  },
  { value: "fpl", label: "FPL", species: ["cat"], defaultIntervalMonths: 12 },
  { value: "tricat", label: "Tricat", species: ["cat"], defaultIntervalMonths: 12 },
  { value: "newcastle", label: "Newcastle", species: ["poultry"], defaultIntervalMonths: 3 },
  { value: "gumboro", label: "Gumboro", species: ["poultry"], defaultIntervalMonths: null },
  { value: "fowl_pox", label: "Fowl pox", species: ["poultry"], defaultIntervalMonths: null },
  {
    value: "anthrax",
    label: "Anthrax",
    species: ["cattle", "sheep", "goat"],
    defaultIntervalMonths: 12
  },
  {
    value: "blackleg",
    label: "Blackleg",
    species: ["cattle", "sheep", "goat"],
    defaultIntervalMonths: 12
  },
  { value: "cbpp", label: "CBPP", species: ["cattle"], defaultIntervalMonths: 12 },
  {
    value: "fmd",
    label: "Foot and mouth",
    species: ["cattle", "sheep", "goat", "pig"],
    defaultIntervalMonths: 6
  },
  { value: "ppr", label: "PPR", species: ["sheep", "goat"], defaultIntervalMonths: 12 },
  { value: "other", label: "Other", species: [], defaultIntervalMonths: null }
];

/**
 * Every route the database will accept for preventive care.
 *
 * Kept here so the options a vet is offered cannot drift from what the schema
 * allows. The first version of this screen offered only vaccine routes, which
 * left a dewormer given as a tablet with nowhere to go.
 */
export const PREVENTIVE_ROUTES = [
  "oral",
  "im",
  "iv",
  "sc",
  "topical",
  "intranasal",
  "in_water",
  "in_feed",
  "wing_web",
  "eye_drop"
] as const;
export type PreventiveRoute = (typeof PREVENTIVE_ROUTES)[number];

const ROUTE_LABELS: Record<PreventiveRoute, string> = {
  oral: "Oral",
  im: "IM",
  iv: "IV",
  sc: "SC",
  topical: "Pour-on",
  intranasal: "Nasal",
  in_water: "In water",
  in_feed: "In feed",
  wing_web: "Wing web",
  eye_drop: "Eye drop"
};

export function routeLabel(route: string): string {
  return ROUTE_LABELS[route as PreventiveRoute] ?? route;
}

/**
 * How this is actually given, narrowed to the case in hand.
 *
 * A dewormer is a tablet, a suspension or a pour-on; a vaccine is injected or,
 * for a flock, put in the water. Offering all ten routes every time would make
 * the common choice harder to find, and offering the wrong four makes it
 * impossible.
 */
export function routesFor(input: {
  kind: "vaccination" | "deworming";
  isGroup: boolean;
}): readonly PreventiveRoute[] {
  if (input.kind === "deworming") {
    return input.isGroup
      ? ["in_water", "in_feed", "oral", "topical"]
      : // Tablets and suspensions first: that is most of small-animal worming.
        ["oral", "topical", "sc", "im"];
  }
  return input.isGroup
    ? ["in_water", "wing_web", "eye_drop", "sc"]
    : ["sc", "im", "intranasal", "oral"];
}

/** The route to start on, which is the one most often used for that case. */
export function defaultRouteFor(input: {
  kind: "vaccination" | "deworming";
  isGroup: boolean;
}): PreventiveRoute {
  return routesFor(input)[0] ?? "oral";
}

/** What may sensibly be given to this species, with `other` always last. */
export function vaccinesForSpecies(species: string): readonly VaccineProfile[] {
  return VACCINE_PROFILES.filter(
    (profile) => profile.species.length === 0 || profile.species.includes(species)
  );
}

export function vaccineLabel(value: string): string {
  return VACCINE_PROFILES.find((profile) => profile.value === value)?.label ?? value;
}

/**
 * The usual next-dose date, offered as a starting point.
 *
 * A suggestion the vet can overwrite, never a silent default: intervals vary
 * with the product, the age of the animal and whether this is a primary course
 * or a booster. Returns null where there is no usual interval, rather than
 * inventing one.
 */
export function suggestedNextDue(vaccine: string, dateGiven: Date): Date | null {
  const months = VACCINE_PROFILES.find(
    (profile) => profile.value === vaccine
  )?.defaultIntervalMonths;
  if (!months) return null;

  const next = new Date(
    Date.UTC(dateGiven.getUTCFullYear(), dateGiven.getUTCMonth() + months, dateGiven.getUTCDate())
  );
  return next;
}

/** Overdue, due soon, or settled — the three states a folder cares about. */
export function dueState(
  nextDue: string | null,
  today = new Date()
): "none" | "overdue" | "due_soon" | "future" {
  if (!nextDue) return "none";
  const due = new Date(`${nextDue}T00:00:00Z`);
  const now = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const days = Math.round((due.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return "overdue";
  // A month's warning: long enough to raise on the next visit rather than
  // needing a special trip.
  if (days <= 30) return "due_soon";
  return "future";
}
