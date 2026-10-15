/**
 * Euthanasia: why, how, and whether death was confirmed.
 *
 * Shared with the database, which constrains the same values.
 */

export const EUTHANASIA_REASONS = [
  "suffering",
  "poor_prognosis",
  "owner_request",
  "financial",
  "food_safety",
  "dangerous",
  "other"
] as const;
export type EuthanasiaReason = (typeof EUTHANASIA_REASONS)[number];

/**
 * "Owner could not afford treatment" is on this list on purpose. Economic
 * euthanasia is real, common, and nobody's failing — and a reason that cannot
 * be recorded honestly gets recorded as something else, which is how the
 * commonest reason in a practice becomes invisible in its own records.
 */
export const REASON_LABELS: Record<EuthanasiaReason, string> = {
  suffering: "Suffering",
  poor_prognosis: "Poor prognosis",
  owner_request: "Owner request",
  financial: "Cost of treatment",
  food_safety: "Food safety",
  dangerous: "Dangerous animal",
  other: "Other"
};

export const EUTHANASIA_METHODS = ["injectable", "captive_bolt", "gunshot", "other"] as const;
export type EuthanasiaMethod = (typeof EUTHANASIA_METHODS)[number];

/** Named apart from the consent METHOD_LABELS, which mean something else. */
export const METHOD_LABELS_EUTHANASIA: Record<EuthanasiaMethod, string> = {
  injectable: "Injection",
  captive_bolt: "Captive bolt",
  gunshot: "Gunshot",
  other: "Other"
};

export const MIN_REASON_DETAIL = 10;

/**
 * What stops this being recordable, said while the form is filled rather than
 * after the tap. The server refuses the same things.
 */
export function euthanasiaProblem(input: {
  reasonDetail: string;
  method: string;
  agent: string;
  deathConfirmed: boolean;
  deathConfirmedBy: string;
}): string | null {
  if (input.reasonDetail.trim().length < MIN_REASON_DETAIL) {
    // The category alone is never the whole story, and this is the one record
    // a veterinarian may have to defend.
    return "Say why, in your own words.";
  }
  if (input.method === "injectable" && input.agent.trim().length === 0) {
    return "Record what was given.";
  }
  if (input.deathConfirmed && input.deathConfirmedBy.trim().length === 0) {
    // The claim without the evidence.
    return "Say how death was confirmed.";
  }
  return null;
}
