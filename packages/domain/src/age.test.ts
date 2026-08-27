import { describe, expect, it } from "vitest";
import { describeAge, describeGroupAge } from "./age";

/** Fixed so these assertions mean the same thing next year. */
const TODAY = new Date("2026-08-27T10:30:00.000Z");

function age(dob: string, precision = "exact"): string | null {
  return describeAge(dob, precision, TODAY);
}

describe("describeAge", () => {
  it("counts a newborn in days rather than reporting zero months", () => {
    // The case that sent this to the domain: a lamb born on the round is three
    // days old, and "0 months" tells the vet nothing.
    expect(age("2026-08-27")).toBe("born today");
    expect(age("2026-08-26")).toBe("1 day");
    expect(age("2026-08-24")).toBe("3 days");
  });

  it("switches to weeks for a litter", () => {
    // Weeks are the unit for litters, broiler flocks and vaccine intervals.
    expect(age("2026-08-13")).toBe("2 weeks");
    expect(age("2026-07-23")).toBe("5 weeks");
  });

  it("switches to months once weeks stop being readable", () => {
    expect(age("2026-06-27")).toBe("2 months");
    expect(age("2025-11-27")).toBe("9 months");
  });

  it("uses years, and years with months, for an adult", () => {
    expect(age("2024-08-27")).toBe("2 years");
    expect(age("2025-08-27")).toBe("1 year");
    expect(age("2023-06-27")).toBe("3y 2m");
  });

  it("does not present an estimate as though it were a certificate", () => {
    expect(age("2024-08-27", "estimated")).toBe("about 2 years");
    expect(age("2024-08-27", "unknown")).toBe("about 2 years");
  });

  it("says nothing when there is no usable date", () => {
    expect(describeAge(null, "exact", TODAY)).toBeNull();
    expect(describeAge("", "exact", TODAY)).toBeNull();
    expect(describeAge("not a date", "exact", TODAY)).toBeNull();
  });

  it("refuses a date in the future rather than reporting a negative age", () => {
    // A typo in the year. The date itself is still shown beside this, so the
    // vet can see what is wrong; inventing "-1 years" would not help.
    expect(age("2027-01-01")).toBeNull();
  });

  it("does not go a day out either side of a birthday", () => {
    // The day before turning one is still months, and the day itself is a year.
    expect(age("2025-08-28")).toBe("11 months");
    expect(age("2025-08-27")).toBe("1 year");
  });
});

describe("describeGroupAge", () => {
  it("keeps weeks as the headline, because that is how the work counts", () => {
    // Broilers go at six weeks. "About 1 month" would be a step backwards.
    expect(describeGroupAge(6)).toBe("6 weeks");
    expect(describeGroupAge(1)).toBe("1 week");
    expect(describeGroupAge(25)).toBe("25 weeks");
  });

  it("translates for a herd old enough that the number stops being readable", () => {
    expect(describeGroupAge(52)).toBe("52 weeks (about 12 months)");
    expect(describeGroupAge(156)).toBe("156 weeks (about 3 years)");
  });

  it("says nothing when no age was recorded", () => {
    expect(describeGroupAge(null)).toBeNull();
    expect(describeGroupAge(undefined)).toBeNull();
    expect(describeGroupAge(-1)).toBeNull();
  });
});
