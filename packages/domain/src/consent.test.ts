import { describe, expect, it } from "vitest";
import { consentProblem, describeConsent } from "./consent";

const good = {
  grantedByName: "Ama Mensah",
  method: "verbal",
  witnessName: "",
  risksExplained: "Anaesthetic risk, bleeding and the cost were explained."
};

describe("consentProblem", () => {
  it("accepts a complete verbal consent", () => {
    expect(consentProblem(good)).toBeNull();
  });

  it("insists somebody is named", () => {
    expect(consentProblem({ ...good, grantedByName: " " })).toMatch(/Name the person/);
  });

  it("insists a witnessed consent names its witness", () => {
    expect(consentProblem({ ...good, method: "verbal_witnessed" })).toMatch(/witness/);
    expect(
      consentProblem({ ...good, method: "verbal_witnessed", witnessName: "Yaw Darko" })
    ).toBeNull();
  });

  it("refuses a consent that does not say what was explained", () => {
    // The substance. Without it the record is a signature on a blank page, and
    // the database refuses the same thing.
    expect(consentProblem({ ...good, risksExplained: "ok" })).toMatch(/what was explained/);
    expect(consentProblem({ ...good, risksExplained: "   " })).not.toBeNull();
  });
});

describe("describeConsent", () => {
  it("reads as a person, a capacity and a method", () => {
    expect(
      describeConsent({
        grantedByName: "Ama Mensah",
        capacity: "owner",
        method: "verbal",
        withdrawnAt: null
      })
    ).toBe("Ama Mensah · Owner · Verbal");
  });

  it("says plainly when consent was withdrawn", () => {
    // Not hidden and not struck through: that consent was given and later
    // withdrawn is itself the record, and a reader needs both halves.
    expect(
      describeConsent({
        grantedByName: "Kwame Boateng",
        capacity: "keeper",
        method: "verbal_witnessed",
        withdrawnAt: "2026-10-15T10:00:00Z"
      })
    ).toBe("Kwame Boateng · Keeper · Verbal, witnessed — withdrawn");
  });

  it("falls back readably on a value it does not know", () => {
    expect(
      describeConsent({
        grantedByName: "X",
        capacity: "something_new",
        method: "other_method",
        withdrawnAt: null
      })
    ).toBe("X · something new · other method");
  });
});
