import { describe, expect, it } from "vitest";
import { resolveDateOfBirth, type DobInput } from "./patient-dob";

const TODAY = new Date(Date.UTC(2026, 7, 9)); // 9 August 2026

function input(overrides: Partial<DobInput>): DobInput {
  return { mode: "exact", exactText: "", years: "", months: "", ...overrides };
}

describe("resolveDateOfBirth", () => {
  it("keeps an exact date exactly", () => {
    const result = resolveDateOfBirth(input({ exactText: "2023-04-17" }), TODAY);
    expect(result).toEqual({ ok: true, date: "2023-04-17", precision: "exact" });
  });

  it("accepts today, since an animal born this morning is a patient", () => {
    const result = resolveDateOfBirth(input({ exactText: "2026-08-09" }), TODAY);
    expect(result).toEqual({ ok: true, date: "2026-08-09", precision: "exact" });
  });

  it("refuses a date in the future", () => {
    const result = resolveDateOfBirth(input({ exactText: "2026-08-10" }), TODAY);
    expect(result).toEqual({ ok: false, message: expect.stringContaining("future") });
  });

  it("refuses a date that does not exist", () => {
    // Date.UTC rolls this into March rather than failing, so the round-trip
    // check is the only thing standing between it and the database.
    const result = resolveDateOfBirth(input({ exactText: "2023-02-31" }), TODAY);
    expect(result).toEqual({ ok: false, message: "That date does not exist." });
  });

  it("refuses text that is not a date", () => {
    expect(resolveDateOfBirth(input({ exactText: "about three" }), TODAY).ok).toBe(false);
    expect(resolveDateOfBirth(input({ exactText: "17/04/2023" }), TODAY).ok).toBe(false);
    expect(resolveDateOfBirth(input({ exactText: "" }), TODAY).ok).toBe(false);
  });

  it("turns a spoken age into a date marked estimated, never exact", () => {
    const result = resolveDateOfBirth(input({ mode: "estimated", years: "3" }), TODAY);
    expect(result).toEqual({ ok: true, date: "2023-08-09", precision: "estimated" });
  });

  it("handles an age in months for an animal under a year", () => {
    const result = resolveDateOfBirth(input({ mode: "estimated", months: "5" }), TODAY);
    expect(result).toEqual({ ok: true, date: "2026-03-09", precision: "estimated" });
  });

  it("combines years and months", () => {
    const result = resolveDateOfBirth(input({ mode: "estimated", years: "2", months: "3" }), TODAY);
    expect(result).toEqual({ ok: true, date: "2024-05-09", precision: "estimated" });
  });

  it("refuses an estimate of nothing", () => {
    const result = resolveDateOfBirth(input({ mode: "estimated" }), TODAY);
    expect(result).toEqual({ ok: false, message: expect.stringContaining("unknown") });
  });

  it("refuses an age that is not a number", () => {
    const result = resolveDateOfBirth(input({ mode: "estimated", years: "two" }), TODAY);
    expect(result.ok).toBe(false);
  });

  it("records unknown as no date at all", () => {
    // The point of the mode. A guess written into date_of_birth would be read
    // later as a fact by anything calculating a dose.
    const result = resolveDateOfBirth(input({ mode: "unknown", exactText: "2020-01-01" }), TODAY);
    expect(result).toEqual({ ok: true, date: null, precision: "unknown" });
  });
});
