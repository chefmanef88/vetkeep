import { describe, expect, it } from "vitest";
import {
  ALL_ENTITY_TYPES,
  conflictPolicyFor,
  discardsLocalChange,
  requiresManualResolution
} from "./conflict";
import type { EntityType } from "./types";

describe("conflict policy", () => {
  it("assigns a policy to every syncable record type", () => {
    for (const entityType of ALL_ENTITY_TYPES) {
      expect(conflictPolicyFor(entityType)).toBeTruthy();
    }
  });

  it("never resolves medical prose automatically", () => {
    // Brief 15.6: no universal field-level merge, and never last-write-wins for
    // medical prose. This is the single most important rule in the file.
    const clinical: EntityType[] = ["visit", "visit_draft", "exam_finding", "visit_amendment"];
    for (const entityType of clinical) {
      expect(conflictPolicyFor(entityType)).not.toBe("last_write_wins");
    }
  });

  it("treats a signed visit as immutable rather than mergeable", () => {
    expect(conflictPolicyFor("visit")).toBe("reject_immutable");
    expect(conflictPolicyFor("visit_amendment")).toBe("reject_immutable");
  });

  it("scopes a draft conflict to the section and an exam conflict to the system", () => {
    expect(conflictPolicyFor("visit_draft")).toBe("manual_section");
    expect(conflictPolicyFor("exam_finding")).toBe("manual_per_system");
  });

  it("asks the vet about competing identity and contact changes", () => {
    expect(conflictPolicyFor("client")).toBe("manual_compare");
    expect(conflictPolicyFor("patient")).toBe("manual_compare");
  });

  it("never merges anything carrying money or a dose", () => {
    // A treatment replayed and merged would record the dose twice, which on a
    // food animal also doubles a withholding period somebody is relying on.
    for (const entityType of [
      "treatment",
      "preventive_care",
      "invoice",
      "invoice_payment"
    ] as EntityType[]) {
      expect(conflictPolicyFor(entityType)).toBe("idempotent_never_merge");
    }
  });

  it("allows last-write-wins only where nothing clinical is at stake", () => {
    const lastWriteWins = ALL_ENTITY_TYPES.filter(
      (entityType) => conflictPolicyFor(entityType) === "last_write_wins"
    );
    // Route stops used to sit here too. With scheduling gone, the only record
    // whose loss costs nothing is a display setting — which is the point of
    // asserting the whole list rather than one membership: a new entity type
    // cannot quietly acquire last-write-wins without this failing.
    expect(lastWriteWins.sort()).toEqual(["display_preference"]);
  });

  it("routes exactly the manual policies to the vet", () => {
    expect(requiresManualResolution("manual_section")).toBe(true);
    expect(requiresManualResolution("manual_per_system")).toBe(true);
    expect(requiresManualResolution("manual_compare")).toBe(true);
    expect(requiresManualResolution("last_write_wins")).toBe(false);
    expect(requiresManualResolution("idempotent_never_merge")).toBe(false);
    expect(requiresManualResolution("reject_immutable")).toBe(false);
  });

  it("drops only the local changes the vet cannot act on", () => {
    expect(discardsLocalChange("idempotent_never_merge")).toBe(true);
    expect(discardsLocalChange("reject_immutable")).toBe(true);
    expect(discardsLocalChange("manual_section")).toBe(false);
    expect(discardsLocalChange("manual_compare")).toBe(false);
  });
});
