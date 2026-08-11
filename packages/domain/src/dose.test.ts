import { describe, expect, it } from "vitest";
import {
  calculateDose,
  concentrationLabel,
  doseRateLabel,
  strengthWarning,
  toKilograms,
  toMgPerMl
} from "./dose";

describe("toMgPerMl", () => {
  it("reads a percentage as grams per hundred millilitres", () => {
    // 20% w/v is 20 g in 100 ml, which is 200 mg/ml. Getting this wrong by a
    // factor of ten is the classic overdose.
    expect(toMgPerMl({ value: 20, unit: "percent" })).toBe(200);
    expect(toMgPerMl({ value: 5, unit: "percent" })).toBe(50);
    expect(toMgPerMl({ value: 0.5, unit: "percent" })).toBe(5);
  });

  it("passes mg/ml through", () => {
    expect(toMgPerMl({ value: 200, unit: "mg_per_ml" })).toBe(200);
  });

  it("refuses to turn international units into milligrams", () => {
    // No conversion exists without knowing the product, so none is invented.
    expect(toMgPerMl({ value: 1000, unit: "iu_per_ml" })).toBeNull();
  });

  it("refuses a strength that is not a positive number", () => {
    expect(toMgPerMl({ value: 0, unit: "mg_per_ml" })).toBeNull();
    expect(toMgPerMl({ value: -5, unit: "mg_per_ml" })).toBeNull();
    expect(toMgPerMl({ value: Number.NaN, unit: "mg_per_ml" })).toBeNull();
  });
});

describe("calculateDose", () => {
  it("works out the syringe volume from rate, weight and strength", () => {
    // 20 mg/kg × 15 kg = 300 mg, ÷ 200 mg/ml = 1.5 ml.
    const result = calculateDose({
      rate: 20,
      rateUnit: "mg_per_kg",
      weightKg: 15,
      concentration: { value: 200, unit: "mg_per_ml" }
    });
    expect(result).toMatchObject({
      ok: true,
      volumeMl: 1.5,
      totalAmount: 300,
      totalAmountUnit: "mg"
    });
  });

  it("shows its working, so the vet can check it rather than trust it", () => {
    const result = calculateDose({
      rate: 20,
      rateUnit: "mg_per_kg",
      weightKg: 15,
      concentration: { value: 200, unit: "mg_per_ml" }
    });
    expect(result.ok && result.working).toContain("20 mg/kg × 15 kg");
    expect(result.ok && result.working).toContain("300 mg");
    expect(result.ok && result.working).toContain("1.5 ml");
  });

  it("spells out what a percentage means in mg/ml", () => {
    // The conversion a reader most needs to be able to check.
    const result = calculateDose({
      rate: 20,
      rateUnit: "mg_per_kg",
      weightKg: 15,
      concentration: { value: 20, unit: "percent" }
    });
    expect(result).toMatchObject({ ok: true, volumeMl: 1.5 });
    expect(result.ok && result.working).toContain("20% (200 mg/ml)");
  });

  it("needs no strength when the rate is already a volume", () => {
    // 1 ml/kg on a 15 kg dog is 15 ml, whatever is in the bottle.
    const result = calculateDose({
      rate: 1,
      rateUnit: "ml_per_kg",
      weightKg: 15,
      concentration: null
    });
    expect(result).toMatchObject({ ok: true, volumeMl: 15, totalAmount: null });
  });

  it("multiplies through for a group given the same dose each", () => {
    const result = calculateDose({
      rate: 10,
      rateUnit: "mg_per_kg",
      weightKg: 2,
      concentration: { value: 100, unit: "mg_per_ml" },
      animals: 50
    });
    // 10 × 2 × 50 = 1000 mg, ÷ 100 mg/ml = 10 ml in total.
    expect(result).toMatchObject({ ok: true, volumeMl: 10, totalAmount: 1000 });
    expect(result.ok && result.working).toContain("50 animals");
  });

  it("handles a bird weighed in grams once converted", () => {
    const weightKg = toKilograms(320, "g");
    expect(weightKg).toBe(0.32);
    const result = calculateDose({
      rate: 10,
      rateUnit: "mg_per_kg",
      weightKg: weightKg as number,
      concentration: { value: 50, unit: "mg_per_ml" }
    });
    // 10 × 0.32 = 3.2 mg, ÷ 50 = 0.06 ml.
    expect(result).toMatchObject({ ok: true, volumeMl: 0.06 });
  });

  it("computes an IU dose only against an IU strength", () => {
    const good = calculateDose({
      rate: 20000,
      rateUnit: "iu_per_kg",
      weightKg: 2,
      concentration: { value: 100000, unit: "iu_per_ml" }
    });
    expect(good).toMatchObject({ ok: true, volumeMl: 0.4, totalAmountUnit: "IU" });

    const bad = calculateDose({
      rate: 20000,
      rateUnit: "iu_per_kg",
      weightKg: 2,
      concentration: { value: 200, unit: "mg_per_ml" }
    });
    expect(bad.ok).toBe(false);
  });

  it("says so rather than guessing when the product has no strength", () => {
    const result = calculateDose({
      rate: 20,
      rateUnit: "mg_per_kg",
      weightKg: 15,
      concentration: null
    });
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.reason).toContain("no strength");
  });

  it("refuses a missing weight, which would otherwise compute a dose of nothing", () => {
    expect(
      calculateDose({
        rate: 20,
        rateUnit: "mg_per_kg",
        weightKg: 0,
        concentration: { value: 200, unit: "mg_per_ml" }
      }).ok
    ).toBe(false);
  });

  it("refuses a missing rate", () => {
    expect(
      calculateDose({
        rate: 0,
        rateUnit: "mg_per_kg",
        weightKg: 15,
        concentration: { value: 200, unit: "mg_per_ml" }
      }).ok
    ).toBe(false);
  });

  it("rounds to two decimals, which is as fine as a syringe is read", () => {
    const result = calculateDose({
      rate: 7,
      rateUnit: "mg_per_kg",
      weightKg: 3.3,
      concentration: { value: 150, unit: "mg_per_ml" }
    });
    // 23.1 mg ÷ 150 = 0.154 ml, which is 0.15 on any syringe.
    expect(result).toMatchObject({ ok: true, volumeMl: 0.15 });
  });
});

describe("strengthWarning", () => {
  it("cannot catch a plausible value under the wrong unit, and does not pretend to", () => {
    // 20% is 200 mg/ml, so entering 20 mg/ml is a tenfold understatement. But
    // 20 mg/ml is an ordinary strength in its own right, so no range check can
    // separate the two. The defence is the working shown beside the result.
    expect(strengthWarning({ value: 20, unit: "mg_per_ml" })).toBeNull();

    const asMgPerMl = calculateDose({
      rate: 20,
      rateUnit: "mg_per_kg",
      weightKg: 15,
      concentration: { value: 20, unit: "mg_per_ml" }
    });
    const asPercent = calculateDose({
      rate: 20,
      rateUnit: "mg_per_kg",
      weightKg: 15,
      concentration: { value: 20, unit: "percent" }
    });
    // The two read differently at a glance, which is what a vet checks.
    expect(asMgPerMl.ok && asMgPerMl.working).toContain("20 mg/ml");
    expect(asPercent.ok && asPercent.working).toContain("20% (200 mg/ml)");
    expect(asMgPerMl.ok && asMgPerMl.volumeMl).toBe(15);
    expect(asPercent.ok && asPercent.volumeMl).toBe(1.5);
  });

  it("catches a strength too weak to be a product off a shelf", () => {
    const warning = strengthWarning({ value: 0.2, unit: "mg_per_ml" });
    expect(warning).toContain("unusually weak");
    expect(warning).toContain("2 mg/ml");
  });

  it("catches mg/ml entered as a percentage", () => {
    expect(strengthWarning({ value: 200, unit: "percent" })).toContain("unusually strong");
  });

  it("says nothing about an ordinary strength", () => {
    expect(strengthWarning({ value: 200, unit: "mg_per_ml" })).toBeNull();
    expect(strengthWarning({ value: 20, unit: "percent" })).toBeNull();
    expect(strengthWarning({ value: 50, unit: "mg_per_ml" })).toBeNull();
  });

  it("refuses more milligrams than fit in a gram", () => {
    expect(strengthWarning({ value: 1500, unit: "mg_per_g" })).toContain("cannot hold");
  });

  it("leaves international units alone, where the range is genuinely wide", () => {
    // Penicillin runs to the millions per millilitre; there is no useful bound.
    expect(strengthWarning({ value: 1000000, unit: "iu_per_ml" })).toBeNull();
  });

  it("warns without refusing, since unusual products exist", () => {
    // A warning is a string, not a failure: the calculation still runs.
    const result = calculateDose({
      rate: 20,
      rateUnit: "mg_per_kg",
      weightKg: 15,
      concentration: { value: 20, unit: "mg_per_ml" }
    });
    expect(result.ok).toBe(true);
  });
});

describe("toKilograms", () => {
  it("converts grams", () => {
    expect(toKilograms(500, "g")).toBe(0.5);
  });

  it("passes kilograms through", () => {
    expect(toKilograms(15, "kg")).toBe(15);
  });

  it("refuses a weight it cannot make sense of", () => {
    expect(toKilograms(15, "lb")).toBeNull();
    expect(toKilograms(0, "kg")).toBeNull();
  });
});

describe("labels", () => {
  it("reads back the units a vet recognises", () => {
    expect(concentrationLabel("mg_per_ml")).toBe("mg/ml");
    expect(concentrationLabel("percent")).toBe("%");
    expect(doseRateLabel("mg_per_kg")).toBe("mg/kg");
    expect(doseRateLabel("unknown")).toBe("unknown");
  });
});
