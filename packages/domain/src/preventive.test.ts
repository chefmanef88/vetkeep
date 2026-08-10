import { describe, expect, it } from "vitest";
import {
  VACCINE_PROFILES,
  VACCINE_TYPES,
  dueState,
  suggestedNextDue,
  vaccineLabel,
  vaccinesForSpecies
} from "./preventive";

describe("vaccine list", () => {
  it("has a profile for every value the database allows", () => {
    // A value missing here renders no option, so a vaccine the schema accepts
    // could never be recorded.
    for (const value of VACCINE_TYPES) {
      expect(VACCINE_PROFILES.some((profile) => profile.value === value)).toBe(true);
    }
    expect(VACCINE_PROFILES).toHaveLength(VACCINE_TYPES.length);
  });

  it("offers a dog what a dog is given", () => {
    const values = vaccinesForSpecies("dog").map((profile) => profile.value);
    expect(values).toContain("dhlpp");
    expect(values).toContain("anti_rabies");
    expect(values).not.toContain("fpl");
    expect(values).not.toContain("newcastle");
  });

  it("offers a cat what a cat is given", () => {
    const values = vaccinesForSpecies("cat").map((profile) => profile.value);
    expect(values).toContain("fpl");
    expect(values).toContain("tricat");
    expect(values).not.toContain("dhlpp");
  });

  it("offers a flock poultry vaccines and not rabies", () => {
    const values = vaccinesForSpecies("poultry").map((profile) => profile.value);
    expect(values).toContain("newcastle");
    expect(values).toContain("gumboro");
    expect(values).not.toContain("anti_rabies");
  });

  it("offers cattle the livestock vaccines", () => {
    const values = vaccinesForSpecies("cattle").map((profile) => profile.value);
    expect(values).toContain("anthrax");
    expect(values).toContain("blackleg");
    expect(values).toContain("cbpp");
  });

  it("always leaves a way to record something not on the list", () => {
    for (const species of ["dog", "cat", "poultry", "cattle", "goat", "rabbit"]) {
      expect(vaccinesForSpecies(species).map((p) => p.value)).toContain("other");
    }
  });

  it("labels a value for reading", () => {
    expect(vaccineLabel("anti_rabies")).toBe("Anti-rabies");
    expect(vaccineLabel("cbpp")).toBe("CBPP");
    // An unrecognised value is shown as stored rather than hidden.
    expect(vaccineLabel("unknown_thing")).toBe("unknown_thing");
  });
});

describe("suggestedNextDue", () => {
  it("offers a year for an annual vaccine", () => {
    const next = suggestedNextDue("anti_rabies", new Date(Date.UTC(2026, 7, 10)));
    expect(next?.toISOString().slice(0, 10)).toBe("2027-08-10");
  });

  it("offers three months for Newcastle", () => {
    const next = suggestedNextDue("newcastle", new Date(Date.UTC(2026, 7, 10)));
    expect(next?.toISOString().slice(0, 10)).toBe("2026-11-10");
  });

  it("invents nothing where there is no usual interval", () => {
    // Gumboro depends on the programme and the age of the birds, so guessing
    // would be worse than asking.
    expect(suggestedNextDue("gumboro", new Date(Date.UTC(2026, 7, 10)))).toBeNull();
    expect(suggestedNextDue("other", new Date(Date.UTC(2026, 7, 10)))).toBeNull();
  });
});

describe("dueState", () => {
  const today = new Date(Date.UTC(2026, 7, 10));

  it("says nothing when no next dose was recorded", () => {
    expect(dueState(null, today)).toBe("none");
  });

  it("is overdue the day after it was due", () => {
    expect(dueState("2026-08-09", today)).toBe("overdue");
  });

  it("counts the day it falls due as still due, not overdue", () => {
    expect(dueState("2026-08-10", today)).toBe("due_soon");
  });

  it("warns a month ahead, so it can be raised on the next visit", () => {
    expect(dueState("2026-09-09", today)).toBe("due_soon");
  });

  it("stays quiet about something far off", () => {
    expect(dueState("2027-08-10", today)).toBe("future");
  });
});
