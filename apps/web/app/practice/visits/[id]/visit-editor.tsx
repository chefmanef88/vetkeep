"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { readableError } from "@/lib/practice/format";
import { definedArgs, optionalNumber, optionalText } from "@/lib/practice/rpc-args";

type Finding = {
  id: string;
  system_name: string;
  status: string;
  remarks: string | null;
};

/**
 * `update_visit_draft` replaces the whole draft rather than patching it: any
 * field it is not given is written as null. Every editable column therefore has
 * to appear in this form and be sent on every save, or a save would silently
 * erase whatever the form omitted.
 */
type Initial = {
  visitDate: string;
  visitType: string;
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
};

const EXAM_STATUSES = [
  { value: "not_examined", label: "Not examined" },
  { value: "normal", label: "Normal" },
  { value: "abnormal", label: "Abnormal" },
  { value: "not_applicable", label: "N/A" }
];

export function VisitEditor({
  visitId,
  initial,
  findings
}: {
  visitId: string;
  initial: Initial;
  findings: Finding[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(null);

    const form = new FormData(event.currentTarget);
    const supabase = createClient();

    const { error: rpcError } = await supabase.rpc(
      "update_visit_draft",
      definedArgs({
        p_id: visitId,
        p_visit_date: initial.visitDate,
        p_visit_type: initial.visitType,
        p_chief_complaint: optionalText(form.get("chiefComplaint")),
        p_history_of_complaint: optionalText(form.get("historyOfComplaint")),
        p_past_medical_history: optionalText(form.get("pastMedicalHistory")),
        p_current_medications: optionalText(form.get("currentMedications")),
        p_temperature_c: optionalNumber(form.get("temperatureC")),
        p_heart_rate_bpm: optionalNumber(form.get("heartRateBpm")),
        p_respiratory_rate_bpm: optionalNumber(form.get("respiratoryRateBpm")),
        p_weight_value: optionalNumber(form.get("weightValue")),
        p_body_condition_score: optionalText(form.get("bodyConditionScore")),
        p_pain_score: optionalText(form.get("painScore")),
        p_problem_list: optionalText(form.get("problemList")),
        p_differential_diagnoses: optionalText(form.get("differentialDiagnoses")),
        p_tentative_diagnosis: optionalText(form.get("tentativeDiagnosis")),
        p_definitive_diagnosis: optionalText(form.get("definitiveDiagnosis")),
        p_treatment_plan: optionalText(form.get("treatmentPlan")),
        p_prescriptions: optionalText(form.get("prescriptions")),
        p_follow_up_plan: optionalText(form.get("followUpPlan")),
        p_next_review_date: optionalText(form.get("nextReviewDate"))
      })
    );

    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }
    setSaved("Draft saved.");
    router.refresh();
  }

  async function setFinding(systemName: string, status: string, remarks: string) {
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc(
      "set_exam_finding",
      definedArgs({
        p_visit_id: visitId,
        p_system_name: systemName,
        p_status: status,
        p_remarks: remarks.trim() === "" ? undefined : remarks.trim()
      })
    );
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }
    router.refresh();
  }

  async function markRemainingNormal() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("mark_remaining_systems_normal", {
      p_visit_id: visitId
    });
    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }
    router.refresh();
  }

  async function complete() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("complete_visit", { p_visit_id: visitId });
    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }
    router.refresh();
  }

  const notExamined = findings.filter((f) => f.status === "not_examined").length;

  return (
    <>
      <section className="card stack">
        <h2>Consultation</h2>
        <form className="stack" onSubmit={saveDraft}>
          <label>
            Presenting complaint
            <textarea name="chiefComplaint" rows={2} defaultValue={initial.chiefComplaint} />
          </label>
          <label>
            History
            <textarea
              name="historyOfComplaint"
              rows={3}
              defaultValue={initial.historyOfComplaint}
            />
          </label>
          <label>
            Past medical history
            <textarea
              name="pastMedicalHistory"
              rows={2}
              defaultValue={initial.pastMedicalHistory}
            />
          </label>
          <label>
            Current medications
            <textarea
              name="currentMedications"
              rows={2}
              defaultValue={initial.currentMedications}
            />
          </label>

          <h3>Vitals</h3>
          <div className="grid">
            <label>
              Temperature °C
              <input name="temperatureC" inputMode="decimal" defaultValue={initial.temperatureC} />
            </label>
            <label>
              Heart rate bpm
              <input name="heartRateBpm" inputMode="numeric" defaultValue={initial.heartRateBpm} />
            </label>
            <label>
              Respiratory rate
              <input
                name="respiratoryRateBpm"
                inputMode="numeric"
                defaultValue={initial.respiratoryRateBpm}
              />
            </label>
            <label>
              Weight kg
              <input name="weightValue" inputMode="decimal" defaultValue={initial.weightValue} />
            </label>
            <label>
              Body condition
              <input
                name="bodyConditionScore"
                defaultValue={initial.bodyConditionScore}
                placeholder="4/9"
              />
            </label>
            <label>
              Pain score
              <input name="painScore" defaultValue={initial.painScore} placeholder="2/4" />
            </label>
          </div>

          <h3>Assessment</h3>
          <label>
            Problem list
            <textarea name="problemList" rows={2} defaultValue={initial.problemList} />
          </label>
          <label>
            Differential diagnoses
            <textarea
              name="differentialDiagnoses"
              rows={2}
              defaultValue={initial.differentialDiagnoses}
            />
          </label>
          <label>
            Tentative diagnosis
            <textarea
              name="tentativeDiagnosis"
              rows={2}
              defaultValue={initial.tentativeDiagnosis}
            />
          </label>
          <label>
            Diagnosis
            <textarea
              name="definitiveDiagnosis"
              rows={2}
              defaultValue={initial.definitiveDiagnosis}
            />
          </label>

          <h3>Plan</h3>
          <label>
            Treatment
            <textarea name="treatmentPlan" rows={3} defaultValue={initial.treatmentPlan} />
          </label>
          <label>
            Prescriptions
            <textarea name="prescriptions" rows={3} defaultValue={initial.prescriptions} />
          </label>
          <label>
            Home care and follow-up
            <textarea name="followUpPlan" rows={2} defaultValue={initial.followUpPlan} />
          </label>
          <label>
            Next review date
            <input type="date" name="nextReviewDate" defaultValue={initial.nextReviewDate} />
          </label>

          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          {saved ? <p role="status">{saved}</p> : null}
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save draft"}
          </button>
        </form>
      </section>

      <section className="card stack">
        <h2>Physical examination</h2>
        <p className="muted">
          Every system starts as not examined. Marking one normal states that you examined it and
          found nothing wrong.
        </p>
        <ul className="exam-list">
          {findings.map((finding) => (
            <ExamRow key={finding.id} finding={finding} onChange={setFinding} />
          ))}
        </ul>
        {notExamined > 0 ? (
          <button type="button" className="secondary" onClick={markRemainingNormal} disabled={busy}>
            Mark the {notExamined} remaining system{notExamined === 1 ? "" : "s"} normal
          </button>
        ) : null}
      </section>

      <section className="card stack">
        <h2>Complete this visit</h2>
        <p className="muted">
          Completing signs the record. After that it cannot be edited — corrections are added as
          separate amendments that sit alongside the original.
        </p>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="button" onClick={complete} disabled={busy}>
          {busy ? "Signing…" : "Complete and sign"}
        </button>
      </section>
    </>
  );
}

function ExamRow({
  finding,
  onChange
}: {
  finding: Finding;
  onChange: (systemName: string, status: string, remarks: string) => void;
}) {
  const [remarks, setRemarks] = useState(finding.remarks ?? "");

  return (
    <li className={`exam-row exam-${finding.status}`}>
      <span className="exam-system">{finding.system_name}</span>
      <select
        value={finding.status}
        onChange={(event) => onChange(finding.system_name, event.target.value, remarks)}
        aria-label={`${finding.system_name} status`}
      >
        {EXAM_STATUSES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        value={remarks}
        placeholder="Remarks"
        aria-label={`${finding.system_name} remarks`}
        onChange={(event) => setRemarks(event.target.value)}
        onBlur={() => {
          if (remarks !== (finding.remarks ?? "")) {
            onChange(finding.system_name, finding.status, remarks);
          }
        }}
      />
    </li>
  );
}
