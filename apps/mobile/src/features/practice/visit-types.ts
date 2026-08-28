export type VisitRow = {
  id: string;
  /** Carried so an edit can tell the server which version it was based on. */
  server_version: number;
  patient_id: string;
  visit_date: string;
  visit_type: string;
  workflow_status: string;
  signed_at: string | null;
  void_reason: string | null;
  chief_complaint: string | null;
  clinical_note: string | null;
  group_size_at_visit: number | null;
  animals_affected: number | null;
  animals_dead: number | null;
  housing_unit: string | null;
  history_of_complaint: string | null;
  past_medical_history: string | null;
  current_medications: string | null;
  temperature_c: number | null;
  heart_rate_bpm: number | null;
  respiratory_rate_bpm: number | null;
  weight_value: number | null;
  body_condition_score: string | null;
  pain_score: string | null;
  problem_list: string | null;
  differential_diagnoses: string | null;
  tentative_diagnosis: string | null;
  definitive_diagnosis: string | null;
  treatment_plan: string | null;
  prescriptions: string | null;
  follow_up_plan: string | null;
  next_review_date: string | null;
  patients: {
    name: string;
    species: string;
    breed: string | null;
    patient_code: string;
    // Purpose decides which withholding periods a treatment on this record
    // must resolve, so the screen cannot ask the right questions without it.
    purpose: string;
    kind: string;
  } | null;
};

export type ExamFinding = {
  id: string;
  server_version: number;
  system_name: string;
  status: string;
  remarks: string | null;
};

export type UsableBatch = {
  id: string;
  batch_lot_number: string | null;
  expiry_date: string | null;
  quantity_on_hand: number;
  inventory_items: { item_name: string; unit: string } | null;
};

export type ConsumedMovement = {
  id: string;
  quantity: number;
  notes: string | null;
  inventory_batches: {
    batch_lot_number: string | null;
    inventory_items: { item_name: string; unit: string } | null;
  } | null;
};

/**
 * The draft form mirrors every column update_visit_draft writes. That RPC
 * replaces the draft rather than patching it, so a field missing from this shape
 * would be written back as null and the vet's note would vanish on the next save.
 */
export type DraftForm = {
  chiefComplaint: string;
  historyOfComplaint: string;
  pastMedicalHistory: string;
  currentMedications: string;
  temperatureC: string;
  heartRateBpm: string;
  respiratoryRateBpm: string;
  weightValue: string;
  bodyConditionScore: string;
  painScore: string;
  problemList: string;
  differentialDiagnoses: string;
  tentativeDiagnosis: string;
  definitiveDiagnosis: string;
  treatmentPlan: string;
  prescriptions: string;
  followUpPlan: string;
  nextReviewDate: string;
  /** The clinician's own note. Free prose, not one of the SOAP boxes. */
  clinicalNote: string;
  /** Group folders only. Empty strings on an individual, and never sent. */
  groupSizeAtVisit: string;
  animalsAffected: string;
  animalsDead: string;
  housingUnit: string;
};

export function draftFromVisit(visit: VisitRow): DraftForm {
  return {
    chiefComplaint: visit.chief_complaint ?? "",
    historyOfComplaint: visit.history_of_complaint ?? "",
    pastMedicalHistory: visit.past_medical_history ?? "",
    currentMedications: visit.current_medications ?? "",
    temperatureC: visit.temperature_c?.toString() ?? "",
    heartRateBpm: visit.heart_rate_bpm?.toString() ?? "",
    respiratoryRateBpm: visit.respiratory_rate_bpm?.toString() ?? "",
    weightValue: visit.weight_value?.toString() ?? "",
    bodyConditionScore: visit.body_condition_score ?? "",
    painScore: visit.pain_score ?? "",
    problemList: visit.problem_list ?? "",
    differentialDiagnoses: visit.differential_diagnoses ?? "",
    tentativeDiagnosis: visit.tentative_diagnosis ?? "",
    definitiveDiagnosis: visit.definitive_diagnosis ?? "",
    treatmentPlan: visit.treatment_plan ?? "",
    prescriptions: visit.prescriptions ?? "",
    followUpPlan: visit.follow_up_plan ?? "",
    nextReviewDate: visit.next_review_date ?? "",
    clinicalNote: visit.clinical_note ?? "",
    groupSizeAtVisit: visit.group_size_at_visit?.toString() ?? "",
    animalsAffected: visit.animals_affected?.toString() ?? "",
    animalsDead: visit.animals_dead?.toString() ?? "",
    housingUnit: visit.housing_unit ?? ""
  };
}
