import { describe, expect, it } from "vitest";
import {
  SPECIES,
  SPECIES_PROFILES,
  allowsGroup,
  isSpecies,
  requiredWithdrawals,
  speciesProfile
} from "./species";

describe("species profiles", () => {
  it("covers every species in the controlled list", () => {
    // The list is enforced by a database check constraint. A species present
    // there and missing here would render a form the database then rejects.
    for (const species of SPECIES) {
      expect(SPECIES_PROFILES[species]).toBeDefined();
      expect(SPECIES_PROFILES[species].species).toBe(species);
    }
  });

  it("falls back to other rather than throwing on an unknown species", () => {
    expect(speciesProfile("dragon").species).toBe("other");
  });

  it("offers group folders only where animals are actually kept in groups", () => {
    expect(allowsGroup("poultry")).toBe(true);
    expect(allowsGroup("goat")).toBe(true);
    expect(allowsGroup("dog")).toBe(false);
    expect(allowsGroup("cat")).toBe(false);
    expect(allowsGroup("bird")).toBe(false);
  });

  it("weighs birds in grams", () => {
    expect(speciesProfile("bird").weightUnit).toBe("g");
    expect(speciesProfile("dog").weightUnit).toBe("kg");
  });

  it("scores body condition on the scale the species uses", () => {
    expect(speciesProfile("dog").bodyConditionScale).toBe("1-9");
    expect(speciesProfile("cattle").bodyConditionScale).toBe("1-5");
    expect(speciesProfile("bird").bodyConditionScale).toBe("keel-1-5");
  });

  it("identifies each pathway the way it is identified in the field", () => {
    expect(speciesProfile("dog").identifier).toBe("microchip");
    expect(speciesProfile("cattle").identifier).toBe("ear_tag");
    expect(speciesProfile("bird").identifier).toBe("leg_ring");
  });

  it("recognises members of the controlled list", () => {
    expect(isSpecies("goat")).toBe(true);
    expect(isSpecies("Goat")).toBe(false);
    expect(isSpecies("dragon")).toBe(false);
  });
});

describe("requiredWithdrawals", () => {
  it("requires nothing for an animal kept as a pet, whatever its species", () => {
    // The rule that matters most: a pet rabbit and a meat rabbit are the same
    // species carrying different obligations.
    expect(requiredWithdrawals({ species: "rabbit", purpose: "pet" })).toEqual([]);
    expect(requiredWithdrawals({ species: "cattle", purpose: "pet" })).toEqual([]);
    expect(requiredWithdrawals({ species: "goat", purpose: "pet" })).toEqual([]);
  });

  it("requires meat withholding for a meat rabbit", () => {
    expect(requiredWithdrawals({ species: "rabbit", purpose: "meat" })).toEqual(["meat"]);
  });

  it("requires milk and meat for a dairy cow", () => {
    const required = requiredWithdrawals({ species: "cattle", purpose: "milk" });
    expect(required).toContain("milk");
    expect(required).toContain("meat");
  });

  it("requires eggs and meat for a laying flock", () => {
    const required = requiredWithdrawals({ species: "poultry", purpose: "eggs" });
    expect(required).toContain("eggs");
    expect(required).toContain("meat");
  });

  it("does not invent a milk withholding for a species that gives none", () => {
    expect(requiredWithdrawals({ species: "pig", purpose: "meat" })).toEqual(["meat"]);
    expect(requiredWithdrawals({ species: "poultry", purpose: "meat" })).not.toContain("milk");
  });

  it("requires nothing of a dog, which has no food purpose to give", () => {
    expect(requiredWithdrawals({ species: "dog", purpose: "breeding" })).toEqual([]);
  });
});
