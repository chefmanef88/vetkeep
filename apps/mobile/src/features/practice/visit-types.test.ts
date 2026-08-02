import { describe, expect, it } from "vitest";
import { draftFromVisit, type DraftForm, type VisitRow } from "./visit-types";

/**
 * update_visit_draft replaces the draft rather than patching it, so any column
 * the form does not send is written back as null. These tests pin the mapping:
 * if someone adds an editable column to the RPC and forgets the form, the
 * omission shows up here rather than as a vet's note quietly disappearing.
 */
const EDITABLE_COLUMNS = [
  "chief_complaint",
  "history_of_complaint",
  "past_medical_history",
  "current_medications",
  "temperature_c",
  "heart_rate_bpm",
  "respiratory_rate_bpm",
  "weight_value",
  "body_condition_score",
  "pain_score",
  "problem_list",
  "differential_diagnoses",
  "tentative_diagnosis",
  "definitive_diagnosis",
  "treatment_plan",
  "prescriptions",
  "follow_up_plan",
  "next_review_date"
] as const;

function baseVisit(overrides: Partial<VisitRow> = {}): VisitRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    patient_id: "22222222-2222-2222-2222-222222222222",
    visit_date: "2026-08-02T10:00:00.000Z",
    visit_type: "home_call",
    workflow_status: "draft",
    signed_at: null,
    void_reason: null,
    chief_complaint: null,
    history_of_complaint: null,
    past_medical_history: null,
    current_medications: null,
    temperature_c: null,
    heart_rate_bpm: null,
    respiratory_rate_bpm: null,
    weight_value: null,
    body_condition_score: null,
    pain_score: null,
    problem_list: null,
    differential_diagnoses: null,
    tentative_diagnosis: null,
    definitive_diagnosis: null,
    treatment_plan: null,
    prescriptions: null,
    follow_up_plan: null,
    next_review_date: null,
    patients: null,
    ...overrides
  };
}

describe("draftFromVisit", () => {
  it("carries every editable column into the form", () => {
    // One field per editable column would be unreadable; instead assert the
    // form has exactly as many fields as the RPC can write.
    const draft = draftFromVisit(baseVisit());
    expect(Object.keys(draft)).toHaveLength(EDITABLE_COLUMNS.length);
  });

  it("turns nulls into empty strings so inputs stay controlled", () => {
    const draft = draftFromVisit(baseVisit());
    for (const value of Object.values(draft)) {
      expect(value).toBe("");
    }
  });

  it("preserves text the vet already wrote", () => {
    const draft = draftFromVisit(
      baseVisit({
        chief_complaint: "Limping on the left hind leg",
        past_medical_history: "Rabies vaccinated March 2026",
        current_medications: "None",
        tentative_diagnosis: "Soft tissue strain"
      })
    );
    expect(draft.chiefComplaint).toBe("Limping on the left hind leg");
    // These four were the columns the web form originally omitted, which meant
    // every save silently erased them.
    expect(draft.pastMedicalHistory).toBe("Rabies vaccinated March 2026");
    expect(draft.currentMedications).toBe("None");
    expect(draft.tentativeDiagnosis).toBe("Soft tissue strain");
  });

  it("renders numeric vitals as editable text without losing precision", () => {
    const draft = draftFromVisit(
      baseVisit({ temperature_c: 38.6, heart_rate_bpm: 96, weight_value: 41.5 })
    );
    expect(draft.temperatureC).toBe("38.6");
    expect(draft.heartRateBpm).toBe("96");
    expect(draft.weightValue).toBe("41.5");
  });

  it("treats a zero vital as a real reading, not as absent", () => {
    // A respiratory rate of zero is clinically meaningful. Falsy checks would
    // drop it, so the mapping must use a null check.
    const draft = draftFromVisit(baseVisit({ respiratory_rate_bpm: 0 }));
    expect(draft.respiratoryRateBpm).toBe("0");
  });

  it("keeps the form keys and the column list in step", () => {
    const draft = draftFromVisit(baseVisit());
    const camel = (column: string) =>
      column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    for (const column of EDITABLE_COLUMNS) {
      expect(draft).toHaveProperty(camel(column) as keyof DraftForm);
    }
  });
});
