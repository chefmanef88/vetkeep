import { describe, expect, it } from "vitest";
import { EUTHANASIA_REASONS, REASON_LABELS, euthanasiaProblem } from "./euthanasia";

const good = {
  reasonDetail: "Advanced renal failure, not responding to fluids over four days.",
  method: "captive_bolt",
  agent: "",
  deathConfirmed: false,
  deathConfirmedBy: ""
};

describe("euthanasiaProblem", () => {
  it("accepts a complete record", () => {
    expect(euthanasiaProblem(good)).toBeNull();
  });

  it("insists on an explanation in the vet's own words", () => {
    // The category alone is never the whole story, and this is the one record
    // a veterinarian may have to defend.
    expect(euthanasiaProblem({ ...good, reasonDetail: "sick" })).toMatch(/own words/);
  });

  it("insists an injection names what was given", () => {
    expect(euthanasiaProblem({ ...good, method: "injectable" })).toMatch(/what was given/);
    expect(
      euthanasiaProblem({ ...good, method: "injectable", agent: "Pentobarbital 150 mg/kg IV" })
    ).toBeNull();
  });

  it("asks nothing of a captive bolt or a gunshot", () => {
    // A system that only understands barbiturates makes the vet either lie or
    // leave it blank.
    for (const method of ["captive_bolt", "gunshot", "other"]) {
      expect(euthanasiaProblem({ ...good, method })).toBeNull();
    }
  });

  it("will not take the claim of confirmation without the evidence", () => {
    expect(euthanasiaProblem({ ...good, deathConfirmed: true })).toMatch(/how death was confirmed/);
    expect(
      euthanasiaProblem({
        ...good,
        deathConfirmed: true,
        deathConfirmedBy: "Absent heartbeat after five minutes"
      })
    ).toBeNull();
  });
});

describe("REASON_LABELS", () => {
  it("has a label for every reason the database accepts", () => {
    // A reason with no label renders as a raw enum to the vet.
    for (const reason of EUTHANASIA_REASONS) {
      expect(REASON_LABELS[reason]).toBeTruthy();
    }
  });

  it("names the financial reason without euphemism", () => {
    // It is on the list so it can be recorded honestly rather than as
    // something else.
    expect(REASON_LABELS["financial"]).toBe("Cost of treatment");
  });
});
