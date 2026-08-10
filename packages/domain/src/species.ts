/**
 * What a species implies, per brief §6.2 and §7.9.
 *
 * Shared between the mobile and web clients so the two cannot offer different
 * answers about whether a goat may be kept as a flock, or which identifier a
 * bird carries. The database enforces the same rules; this is what lets the
 * interface ask the right question rather than letting a vet fill in a form
 * that will be rejected.
 */

export const SPECIES = [
  "dog",
  "cat",
  "bird",
  "cattle",
  "sheep",
  "goat",
  "pig",
  "poultry",
  "rabbit",
  "other"
] as const;
export type Species = (typeof SPECIES)[number];

export const PATIENT_KINDS = ["individual", "group"] as const;
export type PatientKind = (typeof PATIENT_KINDS)[number];

export const PURPOSES = ["pet", "meat", "milk", "eggs", "breeding", "draught"] as const;
export type Purpose = (typeof PURPOSES)[number];

/** How an animal of this species is usually identified. */
export type IdentifierKind = "microchip" | "ear_tag" | "leg_ring" | "none";

/** Which withholding periods a treatment must resolve for this species. */
export type WithdrawalKind = "meat" | "milk" | "eggs";

export type SpeciesProfile = {
  species: Species;
  label: string;
  /** Plural, for a group folder: "flock", "herd". */
  groupNoun: string | null;
  kinds: readonly PatientKind[];
  purposes: readonly Purpose[];
  identifier: IdentifierKind;
  /**
   * Withholding periods that apply when the folder's purpose is not `pet`.
   * A dog has none whatever its purpose.
   */
  withdrawals: readonly WithdrawalKind[];
  /** Body condition is scored differently by species; see §7.9. */
  bodyConditionScale: "1-9" | "1-5" | "keel-1-5" | null;
  /** Birds are weighed in grams; a budgerigar in kilograms is recorded uselessly. */
  weightUnit: "kg" | "g";
};

const COMPANION_PURPOSES = ["pet"] as const;
const LIVESTOCK_PURPOSES = ["meat", "milk", "breeding", "draught", "pet"] as const;

export const SPECIES_PROFILES: Record<Species, SpeciesProfile> = {
  dog: {
    species: "dog",
    label: "Dog",
    groupNoun: null,
    kinds: ["individual"],
    purposes: COMPANION_PURPOSES,
    identifier: "microchip",
    withdrawals: [],
    bodyConditionScale: "1-9",
    weightUnit: "kg"
  },
  cat: {
    species: "cat",
    label: "Cat",
    groupNoun: null,
    kinds: ["individual"],
    purposes: COMPANION_PURPOSES,
    identifier: "microchip",
    withdrawals: [],
    bodyConditionScale: "1-9",
    weightUnit: "kg"
  },
  bird: {
    species: "bird",
    label: "Pet bird",
    groupNoun: null,
    kinds: ["individual"],
    purposes: COMPANION_PURPOSES,
    identifier: "leg_ring",
    withdrawals: [],
    bodyConditionScale: "keel-1-5",
    weightUnit: "g"
  },
  cattle: {
    species: "cattle",
    label: "Cattle",
    groupNoun: "herd",
    kinds: ["individual", "group"],
    purposes: ["milk", "meat", "breeding", "draught", "pet"],
    identifier: "ear_tag",
    withdrawals: ["milk", "meat"],
    bodyConditionScale: "1-5",
    weightUnit: "kg"
  },
  sheep: {
    species: "sheep",
    label: "Sheep",
    groupNoun: "flock",
    kinds: ["individual", "group"],
    purposes: LIVESTOCK_PURPOSES,
    identifier: "ear_tag",
    withdrawals: ["milk", "meat"],
    bodyConditionScale: "1-5",
    weightUnit: "kg"
  },
  goat: {
    species: "goat",
    label: "Goat",
    groupNoun: "flock",
    kinds: ["individual", "group"],
    purposes: LIVESTOCK_PURPOSES,
    identifier: "ear_tag",
    withdrawals: ["milk", "meat"],
    bodyConditionScale: "1-5",
    weightUnit: "kg"
  },
  pig: {
    species: "pig",
    label: "Pig",
    groupNoun: "herd",
    kinds: ["individual", "group"],
    purposes: ["meat", "breeding", "pet"],
    identifier: "ear_tag",
    withdrawals: ["meat"],
    bodyConditionScale: "1-5",
    weightUnit: "kg"
  },
  poultry: {
    species: "poultry",
    label: "Poultry",
    groupNoun: "flock",
    kinds: ["individual", "group"],
    purposes: ["eggs", "meat", "breeding", "pet"],
    identifier: "leg_ring",
    withdrawals: ["meat", "eggs"],
    bodyConditionScale: null,
    weightUnit: "kg"
  },
  rabbit: {
    species: "rabbit",
    label: "Rabbit",
    groupNoun: "colony",
    kinds: ["individual", "group"],
    purposes: ["meat", "breeding", "pet"],
    identifier: "ear_tag",
    withdrawals: ["meat"],
    bodyConditionScale: "1-5",
    weightUnit: "kg"
  },
  other: {
    species: "other",
    label: "Other",
    groupNoun: "group",
    kinds: ["individual", "group"],
    purposes: PURPOSES,
    identifier: "none",
    withdrawals: [],
    bodyConditionScale: null,
    weightUnit: "kg"
  }
};

export function speciesProfile(species: string): SpeciesProfile {
  return SPECIES_PROFILES[species as Species] ?? SPECIES_PROFILES.other;
}

export function isSpecies(value: string): value is Species {
  return (SPECIES as readonly string[]).includes(value);
}

/** A group folder is only offered where keeping animals in groups is real. */
export function allowsGroup(species: string): boolean {
  return speciesProfile(species).kinds.includes("group");
}

/**
 * Which withholding periods a treatment on this folder must resolve.
 *
 * Empty for anything kept as a pet, whatever its species: the obligation
 * follows the animal's destination, not its taxonomy. This is the single most
 * consequential rule in the product, so it lives in one function rather than
 * being re-derived at each call site.
 */
export function requiredWithdrawals(input: {
  species: string;
  purpose: string;
}): readonly WithdrawalKind[] {
  if (input.purpose === "pet") return [];
  const profile = speciesProfile(input.species);
  if (input.purpose === "eggs") {
    return profile.withdrawals.filter((kind) => kind === "eggs" || kind === "meat");
  }
  if (input.purpose === "milk") {
    return profile.withdrawals.filter((kind) => kind === "milk" || kind === "meat");
  }
  return profile.withdrawals;
}

export function purposeLabel(purpose: string): string {
  switch (purpose) {
    case "pet":
      return "Pet";
    case "meat":
      return "Meat";
    case "milk":
      return "Milk";
    case "eggs":
      return "Eggs";
    case "breeding":
      return "Breeding";
    case "draught":
      return "Draught";
    default:
      return purpose;
  }
}
