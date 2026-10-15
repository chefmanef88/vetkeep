/**
 * Consent: who agreed, in what capacity, and how.
 *
 * Shared with the database, which constrains the same values.
 */

export const CONSENT_CAPACITIES = ["owner", "authorised_agent", "keeper"] as const;
export type ConsentCapacity = (typeof CONSENT_CAPACITIES)[number];

export const CAPACITY_LABELS: Record<ConsentCapacity, string> = {
  owner: "Owner",
  authorised_agent: "Authorised agent",
  keeper: "Keeper"
};

export const CONSENT_METHODS = ["verbal", "verbal_witnessed", "written"] as const;
export type ConsentMethod = (typeof CONSENT_METHODS)[number];

export const METHOD_LABELS: Record<ConsentMethod, string> = {
  verbal: "Verbal",
  verbal_witnessed: "Verbal, witnessed",
  written: "Written"
};

/** The shortest explanation that is worth recording, matching the database. */
export const MIN_RISKS_EXPLAINED = 10;

/**
 * What stops this consent being recordable, said while the form is being
 * filled rather than after the tap. The server refuses the same things.
 */
export function consentProblem(input: {
  grantedByName: string;
  method: string;
  witnessName: string;
  risksExplained: string;
}): string | null {
  if (input.grantedByName.trim().length < 2) {
    return "Name the person who agreed.";
  }
  if (input.method === "verbal_witnessed" && input.witnessName.trim().length < 2) {
    return "A witnessed consent needs the witness named.";
  }
  if (input.risksExplained.trim().length < MIN_RISKS_EXPLAINED) {
    // The substance. A consent that does not say what was explained records
    // nothing worth having.
    return "Record what was explained to them.";
  }
  return null;
}

/**
 * How a recorded consent reads in a list.
 *
 * A withdrawn consent is not hidden and not struck through — it is stated,
 * because the fact that consent was given and later withdrawn is itself the
 * record, and a reader needs both halves.
 */
export function describeConsent(input: {
  grantedByName: string;
  capacity: string;
  method: string;
  withdrawnAt: string | null;
}): string {
  const capacity =
    CAPACITY_LABELS[input.capacity as ConsentCapacity] ?? input.capacity.replace(/_/g, " ");
  const method = METHOD_LABELS[input.method as ConsentMethod] ?? input.method.replace(/_/g, " ");
  const head = `${input.grantedByName} · ${capacity} · ${method}`;
  return input.withdrawnAt ? `${head} — withdrawn` : head;
}
