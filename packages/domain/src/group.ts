// Population figures for a flock or a herd.
//
// A record on a group is not a record on one animal repeated. The clinical
// picture is how many are sick out of how many, how many are dead, and where —
// and the individual examination that sits beside it describes a sample, not
// the subject.
//
// Rates are derived here rather than stored. A percentage written into the
// database drifts from its own numerator the first time a count is corrected,
// and the two then disagree with no way to tell which was meant.

export type GroupObservation = {
  groupSize: number | null;
  affected: number | null;
  dead: number | null;
};

/** Null when it cannot be worked out, rather than zero, which is a finding. */
function rate(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0 || numerator < 0) return null;
  return (numerator / denominator) * 100;
}

/** Proportion showing signs. */
export function morbidityRate(observation: GroupObservation): number | null {
  return rate(observation.affected, observation.groupSize);
}

/** Proportion dead. */
export function mortalityRate(observation: GroupObservation): number | null {
  return rate(observation.dead, observation.groupSize);
}

/**
 * Proportion of the affected animals that died.
 *
 * Separate from mortality and often the more useful of the two: half a flock
 * falling ill with none dying is a different problem from ten falling ill and
 * nine dying, and the mortality rate alone reads as milder in the second case.
 */
export function caseFatalityRate(observation: GroupObservation): number | null {
  if (observation.affected === null || observation.affected <= 0) return null;
  if (observation.dead === null) return null;
  // Deaths can exceed the recorded affected count — a peracute death may never
  // have been entered as a case — so this is not capped at 100. Showing 150%
  // is a prompt to correct the numbers, which hiding it would not be.
  return (observation.dead / observation.affected) * 100;
}

/** One decimal, and no trailing ".0" on a whole number. */
export function formatRate(value: number | null): string | null {
  if (value === null) return null;
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

/**
 * The figures as a clinician would say them: "11 of 400 affected (2.8%)".
 *
 * Returns null when nothing was counted, so a group record with no population
 * data shows nothing rather than a row of dashes.
 */
export function describeGroupObservation(observation: GroupObservation): string | null {
  const { groupSize, affected, dead } = observation;
  if (affected === null && dead === null) return null;

  const parts: string[] = [];
  if (affected !== null) {
    const share = formatRate(morbidityRate(observation));
    parts.push(
      groupSize === null
        ? `${affected} affected`
        : `${affected} of ${groupSize} affected${share ? ` (${share})` : ""}`
    );
  }
  if (dead !== null) {
    const share = formatRate(mortalityRate(observation));
    parts.push(groupSize === null ? `${dead} dead` : `${dead} dead${share ? ` (${share})` : ""}`);
  }
  return parts.join(" · ");
}
