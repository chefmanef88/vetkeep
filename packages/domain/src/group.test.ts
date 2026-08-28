import { describe, expect, it } from "vitest";
import {
  caseFatalityRate,
  describeGroupObservation,
  formatRate,
  morbidityRate,
  mortalityRate
} from "./group";

describe("group rates", () => {
  const outbreak = { groupSize: 400, affected: 11, dead: 3 };

  it("works out morbidity and mortality against the group size on the day", () => {
    expect(morbidityRate(outbreak)).toBeCloseTo(2.75);
    expect(mortalityRate(outbreak)).toBeCloseTo(0.75);
  });

  it("gives case fatality separately, because it says something different", () => {
    // Half a flock ill with none dying is a different problem from ten ill and
    // nine dying, and mortality alone reads as milder in the second case.
    expect(caseFatalityRate({ groupSize: 400, affected: 200, dead: 0 })).toBe(0);
    expect(caseFatalityRate({ groupSize: 400, affected: 10, dead: 9 })).toBeCloseTo(90);
  });

  it("returns null rather than zero when nothing was counted", () => {
    // Null means "not counted"; zero means "counted, and none". A record must
    // not turn the first into the second.
    expect(morbidityRate({ groupSize: 400, affected: null, dead: null })).toBeNull();
    expect(mortalityRate({ groupSize: null, affected: 11, dead: 3 })).toBeNull();
    expect(caseFatalityRate({ groupSize: 400, affected: 0, dead: 0 })).toBeNull();
  });

  it("does not cap case fatality at a hundred", () => {
    // Deaths can exceed the recorded cases when a peracute death was never
    // entered as one. Showing 150% prompts a correction; hiding it does not.
    expect(caseFatalityRate({ groupSize: 400, affected: 2, dead: 3 })).toBeCloseTo(150);
  });

  it("refuses a denominator that cannot produce a rate", () => {
    expect(morbidityRate({ groupSize: 0, affected: 5, dead: 0 })).toBeNull();
    expect(morbidityRate({ groupSize: -1, affected: 5, dead: 0 })).toBeNull();
  });
});

describe("formatRate", () => {
  it("drops a trailing zero but keeps a real decimal", () => {
    expect(formatRate(50)).toBe("50%");
    expect(formatRate(2.75)).toBe("2.8%");
    expect(formatRate(null)).toBeNull();
  });
});

describe("describeGroupObservation", () => {
  it("says it the way a clinician would", () => {
    expect(describeGroupObservation({ groupSize: 400, affected: 11, dead: 3 })).toBe(
      "11 of 400 affected (2.8%) · 3 dead (0.8%)"
    );
  });

  it("drops the share when there is no denominator", () => {
    expect(describeGroupObservation({ groupSize: null, affected: 11, dead: null })).toBe(
      "11 affected"
    );
  });

  it("says nothing at all when nothing was counted", () => {
    // A group record with no population data should show no row, not a row of
    // dashes pretending to be data.
    expect(describeGroupObservation({ groupSize: 400, affected: null, dead: null })).toBeNull();
  });
});
