import { describe, expect, it } from "vitest";
import { anaesthesiaProblem, procedureSuggestions, protocolFieldsFor } from "./surgery";

describe("anaesthesiaProblem", () => {
  it("refuses a general anaesthetic with no induction agent", () => {
    // The same thing the database refuses. Said before the tap rather than
    // after, so the vet is not told at save time what the form could have told
    // them while they were filling it.
    expect(anaesthesiaProblem({ anaesthesia: "general", inductionAgent: "" })).toMatch(
      /induction agent/
    );
    expect(anaesthesiaProblem({ anaesthesia: "general", inductionAgent: "   " })).not.toBeNull();
  });

  it("accepts a general once the agent is written down", () => {
    expect(
      anaesthesiaProblem({ anaesthesia: "general", inductionAgent: "Propofol 4 mg/kg IV" })
    ).toBeNull();
  });

  it("asks nothing of the protocols that have nothing to induce", () => {
    // A standing castration under a local has no induction agent, and demanding
    // one would be the form being stricter than the record it writes.
    for (const a of ["none", "local", "regional", "sedation"]) {
      expect(anaesthesiaProblem({ anaesthesia: a, inductionAgent: "" })).toBeNull();
    }
  });
});

describe("protocolFieldsFor", () => {
  it("asks the full protocol of a general", () => {
    expect(protocolFieldsFor("general")).toEqual({
      premedication: true,
      induction: true,
      maintenance: true,
      monitoring: true
    });
  });

  it("asks a sedation only what a sedation has", () => {
    const f = protocolFieldsFor("sedation");
    expect(f.premedication).toBe(true);
    expect(f.monitoring).toBe(true);
    expect(f.induction).toBe(false);
    expect(f.maintenance).toBe(false);
  });

  it("asks a local nothing", () => {
    // Fields that cannot apply train the vet to skip fields, which is how the
    // ones that matter start being skipped too.
    expect(Object.values(protocolFieldsFor("local")).every((v) => v === false)).toBe(true);
    expect(Object.values(protocolFieldsFor("none")).every((v) => v === false)).toBe(true);
  });
});

describe("procedureSuggestions", () => {
  it("offers a dog what is done to dogs", () => {
    const labels = procedureSuggestions("dog").map((s) => s.label);
    expect(labels).toContain("Ovariohysterectomy");
    expect(labels).toContain("Enterotomy");
    expect(labels).not.toContain("Disbudding");
  });

  it("offers cattle the farm procedures", () => {
    const labels = procedureSuggestions("cattle").map((s) => s.label);
    expect(labels).toContain("Disbudding");
    expect(labels).toContain("Rumenotomy");
    expect(labels).not.toContain("Ovariohysterectomy");
  });

  it("keeps the ones that apply to anything, whatever the species", () => {
    for (const species of ["dog", "cattle", "poultry", "something-new"]) {
      const labels = procedureSuggestions(species).map((s) => s.label);
      expect(labels).toContain("Castration");
      expect(labels).toContain("Wound repair");
    }
  });
});
