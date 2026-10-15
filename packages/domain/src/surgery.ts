/**
 * Surgical procedures, and the anaesthetic that goes with them.
 *
 * Shared with the database, which constrains the same values. The interface
 * uses this to ask the right question; the database uses its own copy to refuse
 * a wrong answer. Neither trusts the other.
 */

export const PROCEDURE_KINDS = ["routine", "therapeutic", "emergency"] as const;
export type ProcedureKind = (typeof PROCEDURE_KINDS)[number];

export const PROCEDURE_KIND_LABELS: Record<ProcedureKind, string> = {
  routine: "Routine",
  therapeutic: "Therapeutic",
  emergency: "Emergency"
};

export const ANAESTHESIA_TYPES = ["none", "local", "regional", "sedation", "general"] as const;
export type AnaesthesiaType = (typeof ANAESTHESIA_TYPES)[number];

export const ANAESTHESIA_LABELS: Record<AnaesthesiaType, string> = {
  none: "None",
  local: "Local",
  regional: "Regional",
  sedation: "Sedation",
  general: "General"
};

export const PROCEDURE_OUTCOMES = ["uneventful", "complication", "died"] as const;
export type ProcedureOutcome = (typeof PROCEDURE_OUTCOMES)[number];

/**
 * "Uneventful" is the textbook word for a procedure that went to plan, and it
 * was the first label here. A veterinarian looking at the form read the three
 * options and asked where "success" was — which is the right complaint: a
 * record is filled in by the person doing the work, not by the person who
 * chose the vocabulary.
 *
 * The stored value stays `uneventful`, so nothing already recorded changes
 * meaning and the database constraint is untouched. Only the word on screen
 * moves.
 */
export const OUTCOME_LABELS: Record<ProcedureOutcome, string> = {
  uneventful: "Successful",
  complication: "Complication",
  died: "Died"
};

/**
 * Procedures offered first, by what is in front of the vet.
 *
 * Most surgery a house-call and farm vet does is routine, and typing
 * "Ovariohysterectomy" on a phone in a yard is the kind of friction that ends
 * with "spay" in the record and nothing searchable later. These are
 * suggestions, never a closed list — the field stays free text.
 */
type Suggestion = { label: string; kind: ProcedureKind; species?: readonly string[] };

const SUGGESTIONS: readonly Suggestion[] = [
  { label: "Ovariohysterectomy", kind: "routine", species: ["dog", "cat", "rabbit"] },
  { label: "Castration", kind: "routine" },
  { label: "Caesarean section", kind: "emergency" },
  { label: "Disbudding", kind: "routine", species: ["cattle", "goat"] },
  { label: "Dehorning", kind: "routine", species: ["cattle", "goat"] },
  { label: "Wound repair", kind: "therapeutic" },
  { label: "Abscess lancing", kind: "therapeutic" },
  { label: "Mass removal", kind: "therapeutic" },
  { label: "Enterotomy", kind: "emergency", species: ["dog", "cat"] },
  { label: "Rumenotomy", kind: "emergency", species: ["cattle", "goat", "sheep"] },
  { label: "Teat repair", kind: "therapeutic", species: ["cattle", "goat"] },
  { label: "Hoof trimming", kind: "routine", species: ["cattle", "goat", "sheep"] }
];

/** The ones worth offering for this animal, commonest first. */
export function procedureSuggestions(species: string): readonly Suggestion[] {
  const s = species.toLowerCase();
  return SUGGESTIONS.filter((item) => !item.species || item.species.includes(s));
}

/**
 * Whether the protocol has enough recorded to stand as a record of itself.
 *
 * Only the general is checked, and only for its induction agent. The database
 * refuses the same thing, so this exists to say so before the vet taps save
 * rather than after — and it deliberately does not invent further requirements
 * the server would then accept, which would make the form stricter than the
 * record it writes.
 */
export function anaesthesiaProblem(input: {
  anaesthesia: string;
  inductionAgent: string;
}): string | null {
  if (input.anaesthesia !== "general") return null;
  if (input.inductionAgent.trim().length > 0) return null;
  return "A general anaesthetic needs its induction agent recorded.";
}

/** Which protocol fields are worth asking about for this anaesthetic. */
export function protocolFieldsFor(anaesthesia: string): {
  premedication: boolean;
  induction: boolean;
  maintenance: boolean;
  monitoring: boolean;
} {
  switch (anaesthesia) {
    case "general":
      return { premedication: true, induction: true, maintenance: true, monitoring: true };
    case "sedation":
      return { premedication: true, induction: false, maintenance: false, monitoring: true };
    case "regional":
    case "local":
      // Nothing to induce and nothing to maintain. Asking anyway trains the vet
      // to skip fields, which is how the ones that matter start being skipped.
      return { premedication: false, induction: false, maintenance: false, monitoring: false };
    default:
      return { premedication: false, induction: false, maintenance: false, monitoring: false };
  }
}
