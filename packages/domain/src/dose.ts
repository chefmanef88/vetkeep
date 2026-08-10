/**
 * Working out how much to draw up.
 *
 * A vet does this in their head all day: rate times weight gives the amount of
 * drug, divided by the strength of the bottle gives the volume in the syringe.
 * It is simple arithmetic and it is also where a decimal point goes missing at
 * the end of a long day, on a phone, in the sun, holding a dog.
 *
 * Everything here is pure so the arithmetic can be tested without a device, and
 * every result carries its own working so the vet can check the answer rather
 * than trust it. A calculated number with no derivation is a number nobody can
 * verify.
 */

export const CONCENTRATION_UNITS = ["mg_per_ml", "percent", "iu_per_ml", "mg_per_g"] as const;
export type ConcentrationUnit = (typeof CONCENTRATION_UNITS)[number];

export const DOSE_RATE_UNITS = ["mg_per_kg", "ml_per_kg", "iu_per_kg"] as const;
export type DoseRateUnit = (typeof DOSE_RATE_UNITS)[number];

export type Concentration = { value: number; unit: ConcentrationUnit };

const CONCENTRATION_LABELS: Record<ConcentrationUnit, string> = {
  mg_per_ml: "mg/ml",
  percent: "%",
  iu_per_ml: "IU/ml",
  mg_per_g: "mg/g"
};

const RATE_LABELS: Record<DoseRateUnit, string> = {
  mg_per_kg: "mg/kg",
  ml_per_kg: "ml/kg",
  iu_per_kg: "IU/kg"
};

export function concentrationLabel(unit: string): string {
  return CONCENTRATION_LABELS[unit as ConcentrationUnit] ?? unit;
}

export function doseRateLabel(unit: string): string {
  return RATE_LABELS[unit as DoseRateUnit] ?? unit;
}

/**
 * A percentage on a veterinary label is w/v: grams per 100 ml. So 20% is 20 g
 * in 100 ml, which is 200 mg/ml. Getting this wrong by a factor of ten is the
 * classic way to overdose an animal, which is why it is converted here once
 * rather than in each caller's head.
 */
export function toMgPerMl(concentration: Concentration): number | null {
  if (!Number.isFinite(concentration.value) || concentration.value <= 0) return null;
  switch (concentration.unit) {
    case "mg_per_ml":
      return concentration.value;
    case "percent":
      return concentration.value * 10;
    case "mg_per_g":
      // Assumes a density of 1 g/ml, which holds for the aqueous products this
      // is used for. Anything else should be entered as mg/ml directly.
      return concentration.value;
    case "iu_per_ml":
      // Not milligrams at all; an IU dose is handled on its own path.
      return null;
    default:
      return null;
  }
}

export type DoseResult =
  | {
      ok: true;
      /** What to draw up, in millilitres. */
      volumeMl: number;
      /** The total amount of drug, where that is a meaningful number. */
      totalAmount: number | null;
      totalAmountUnit: "mg" | "IU" | null;
      /** The sum as a person would check it. */
      working: string;
    }
  | { ok: false; reason: string };

/** Two decimals is the finest a syringe is read to; more implies false precision. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(round(value));
}

export function calculateDose(input: {
  rate: number;
  rateUnit: DoseRateUnit;
  weightKg: number;
  concentration: Concentration | null;
  /** Group treatment: the same dose given to each of this many animals. */
  animals?: number;
}): DoseResult {
  const animals = input.animals ?? 1;

  if (!Number.isFinite(input.rate) || input.rate <= 0) {
    return { ok: false, reason: "Enter the dose rate." };
  }
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    return { ok: false, reason: "Enter the animal's weight." };
  }
  if (!Number.isFinite(animals) || animals < 1) {
    return { ok: false, reason: "Enter how many animals are being treated." };
  }

  const weightLabel = `${formatNumber(input.weightKg)} kg`;
  const perAnimal = `${formatNumber(input.rate)} ${doseRateLabel(input.rateUnit)} × ${weightLabel}`;
  const forAll = animals > 1 ? ` × ${animals} animals` : "";

  // A rate already in millilitres needs no concentration: the bottle's strength
  // is irrelevant when the label says how much liquid to give.
  if (input.rateUnit === "ml_per_kg") {
    const volumeMl = round(input.rate * input.weightKg * animals);
    return {
      ok: true,
      volumeMl,
      totalAmount: null,
      totalAmountUnit: null,
      working: `${perAnimal}${forAll} = ${formatNumber(volumeMl)} ml`
    };
  }

  if (!input.concentration) {
    return {
      ok: false,
      reason: "This product has no strength on file, so the volume cannot be worked out."
    };
  }

  if (input.rateUnit === "iu_per_kg") {
    if (input.concentration.unit !== "iu_per_ml") {
      // Milligrams and international units measure different things, and no
      // conversion between them exists without knowing the product.
      return {
        ok: false,
        reason: "An IU dose needs a strength in IU/ml."
      };
    }
    const totalIu = input.rate * input.weightKg * animals;
    const volumeMl = round(totalIu / input.concentration.value);
    return {
      ok: true,
      volumeMl,
      totalAmount: round(totalIu),
      totalAmountUnit: "IU",
      working: `${perAnimal}${forAll} = ${formatNumber(totalIu)} IU ÷ ${formatNumber(
        input.concentration.value
      )} IU/ml = ${formatNumber(volumeMl)} ml`
    };
  }

  const mgPerMl = toMgPerMl(input.concentration);
  if (mgPerMl === null || mgPerMl <= 0) {
    return {
      ok: false,
      reason: "A dose in mg needs a strength in mg/ml or a percentage."
    };
  }

  const totalMg = input.rate * input.weightKg * animals;
  const volumeMl = round(totalMg / mgPerMl);

  // The percentage is shown as the mg/ml it means, because that conversion is
  // the step a reader most needs to be able to check.
  const strength =
    input.concentration.unit === "percent"
      ? `${formatNumber(input.concentration.value)}% (${formatNumber(mgPerMl)} mg/ml)`
      : `${formatNumber(mgPerMl)} mg/ml`;

  return {
    ok: true,
    volumeMl,
    totalAmount: round(totalMg),
    totalAmountUnit: "mg",
    working: `${perAnimal}${forAll} = ${formatNumber(totalMg)} mg ÷ ${strength} = ${formatNumber(
      volumeMl
    )} ml`
  };
}

/** Birds are weighed in grams; the arithmetic is always done in kilograms. */
export function toKilograms(value: number, unit: string): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (unit === "g") return value / 1000;
  if (unit === "kg") return value;
  return null;
}
