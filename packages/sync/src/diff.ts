/**
 * Field-level comparison for the conflict screen, per brief section 15.6.
 *
 * The screen shows what actually differs, not the whole record. A consultation
 * has twenty editable fields; if two devices disagree about the treatment plan,
 * presenting all twenty buries the one decision the vet has to make and invites
 * them to click through without reading.
 */

export interface FieldSpec {
  /** The RPC parameter carrying this field in the queued mutation. */
  param: string;
  /** The column holding it on the server row. */
  column: string;
  /** What the vet calls it. */
  label: string;
}

export interface FieldConflict {
  field: FieldSpec;
  local: string | null;
  server: string | null;
}

export type Resolution = "keep_local" | "keep_server";

/**
 * Normalises a stored value for comparison.
 *
 * Null, undefined and empty string all mean "the vet wrote nothing here", and
 * the RPCs already collapse blanks to null on write. Treating them as different
 * would show phantom conflicts on fields nobody touched, which teaches the vet
 * that the conflict screen cries wolf.
 */
export function normaliseValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/** Only the fields where the two versions genuinely disagree. */
export function diffFields(
  localPayload: Record<string, unknown>,
  serverRow: Record<string, unknown>,
  fields: FieldSpec[]
): FieldConflict[] {
  const conflicts: FieldConflict[] = [];

  for (const field of fields) {
    const local = normaliseValue(localPayload[field.param]);
    const server = normaliseValue(serverRow[field.column]);
    if (local !== server) {
      conflicts.push({ field, local, server });
    }
  }

  return conflicts;
}

/**
 * Builds the payload to send once the vet has chosen.
 *
 * Choices are per field, so "combine" is not a separate mode: keeping local on
 * some fields and server on others is exactly what combining means, and giving
 * it its own free-text editor would let a vet produce a record neither device
 * ever held.
 */
export function buildResolvedPayload(
  localPayload: Record<string, unknown>,
  serverRow: Record<string, unknown>,
  conflicts: FieldConflict[],
  choices: Record<string, Resolution>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = { ...localPayload };

  for (const conflict of conflicts) {
    const choice = choices[conflict.field.param] ?? "keep_local";
    if (choice === "keep_server") {
      resolved[conflict.field.param] = serverRow[conflict.field.column] ?? undefined;
    }
  }

  return resolved;
}

/** True when the vet has decided every field that needs deciding. */
export function isFullyResolved(
  conflicts: FieldConflict[],
  choices: Record<string, Resolution>
): boolean {
  return conflicts.every((conflict) => choices[conflict.field.param] !== undefined);
}

/** Fields of a consultation draft, in the order the vet fills them in. */
export const VISIT_DRAFT_FIELDS: FieldSpec[] = [
  { param: "p_chief_complaint", column: "chief_complaint", label: "Presenting complaint" },
  { param: "p_history_of_complaint", column: "history_of_complaint", label: "History" },
  {
    param: "p_past_medical_history",
    column: "past_medical_history",
    label: "Past medical history"
  },
  { param: "p_current_medications", column: "current_medications", label: "Current medications" },
  { param: "p_temperature_c", column: "temperature_c", label: "Temperature" },
  { param: "p_heart_rate_bpm", column: "heart_rate_bpm", label: "Heart rate" },
  { param: "p_respiratory_rate_bpm", column: "respiratory_rate_bpm", label: "Respiratory rate" },
  { param: "p_weight_value", column: "weight_value", label: "Weight" },
  { param: "p_body_condition_score", column: "body_condition_score", label: "Body condition" },
  { param: "p_pain_score", column: "pain_score", label: "Pain score" },
  { param: "p_problem_list", column: "problem_list", label: "Problem list" },
  { param: "p_differential_diagnoses", column: "differential_diagnoses", label: "Differentials" },
  { param: "p_tentative_diagnosis", column: "tentative_diagnosis", label: "Tentative diagnosis" },
  { param: "p_definitive_diagnosis", column: "definitive_diagnosis", label: "Diagnosis" },
  { param: "p_treatment_plan", column: "treatment_plan", label: "Treatment" },
  { param: "p_prescriptions", column: "prescriptions", label: "Prescriptions" },
  { param: "p_follow_up_plan", column: "follow_up_plan", label: "Home care and follow-up" },
  { param: "p_next_review_date", column: "next_review_date", label: "Next review" }
];

export const EXAM_FINDING_FIELDS: FieldSpec[] = [
  { param: "p_status", column: "status", label: "Finding" },
  { param: "p_remarks", column: "remarks", label: "Remarks" }
];

export const CLIENT_FIELDS: FieldSpec[] = [
  { param: "p_name", column: "name", label: "Name" },
  { param: "p_phone_display", column: "phone_display", label: "Phone" },
  { param: "p_phone_e164", column: "phone_e164", label: "Phone in E.164" },
  { param: "p_address", column: "address", label: "Address" },
  { param: "p_notes", column: "notes", label: "Notes" }
];

export const PATIENT_FIELDS: FieldSpec[] = [
  { param: "p_name", column: "name", label: "Name" },
  { param: "p_species", column: "species", label: "Species" },
  { param: "p_breed", column: "breed", label: "Breed" },
  { param: "p_sex", column: "sex", label: "Sex" },
  { param: "p_microchip_id", column: "microchip_id", label: "Microchip" },
  { param: "p_status", column: "status", label: "Status" }
];
