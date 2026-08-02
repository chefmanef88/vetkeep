"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@vetkeep/database/types";
import { createClient } from "@/lib/supabase/browser";
import { formatDate, formatDateTime, readableError } from "@/lib/practice/format";

type Finding = { id: string; system_name: string; status: string; remarks: string | null };
type Amendment = { id: string; reason: string; amendment_text: string; signed_at: string };

/** The visit row as selected by the page, including the joined patient. */
type SignedVisit = Database["public"]["Tables"]["visits"]["Row"];

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="record-field">
      <span className="field-label">{label}</span>
      <p>{value}</p>
    </div>
  );
}

export function CompletedVisit({
  visit,
  findings,
  amendments
}: {
  visit: SignedVisit;
  findings: Finding[];
  amendments: Amendment[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const examined = findings.filter((f) => f.status !== "not_examined");
  const abnormal = findings.filter((f) => f.status === "abnormal");

  async function amend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const supabase = createClient();

    const { error: rpcError } = await supabase.rpc("create_visit_amendment", {
      p_id: crypto.randomUUID(),
      p_visit_id: visit.id,
      p_reason: String(form.get("reason") ?? ""),
      p_amendment_text: String(form.get("text") ?? "")
    });

    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <section className="card stack">
        <h2>Signed record</h2>
        <Field label="Presenting complaint" value={visit.chief_complaint} />
        <Field label="History" value={visit.history_of_complaint} />

        <div className="vitals-row">
          {visit.temperature_c ? <span>{visit.temperature_c} °C</span> : null}
          {visit.heart_rate_bpm ? <span>{visit.heart_rate_bpm} bpm</span> : null}
          {visit.respiratory_rate_bpm ? (
            <span>{visit.respiratory_rate_bpm} breaths/min</span>
          ) : null}
          {visit.weight_value ? <span>{visit.weight_value} kg</span> : null}
        </div>

        <Field label="Problem list" value={visit.problem_list} />
        <Field label="Differentials" value={visit.differential_diagnoses} />
        <Field label="Diagnosis" value={visit.definitive_diagnosis} />
        <Field label="Treatment" value={visit.treatment_plan} />
        <Field label="Prescriptions" value={visit.prescriptions} />
        <Field label="Home care and follow-up" value={visit.follow_up_plan} />
        {visit.next_review_date ? (
          <Field label="Next review" value={formatDate(visit.next_review_date)} />
        ) : null}
      </section>

      <section className="card stack">
        <h2>Examination</h2>
        <p className="muted">
          {examined.length} of {findings.length} systems examined
          {abnormal.length ? ` · ${abnormal.length} abnormal` : ""}
        </p>
        <ul className="exam-list">
          {findings.map((finding) => (
            <li key={finding.id} className={`exam-row exam-${finding.status}`}>
              <span className="exam-system">{finding.system_name}</span>
              <span className={`pill pill-${finding.status}`}>
                {finding.status.replace("_", " ")}
              </span>
              <span className="muted">{finding.remarks ?? ""}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack">
        <h2>Amendments</h2>
        {amendments.length ? (
          <ul className="record-list">
            {amendments.map((amendment) => (
              <li key={amendment.id}>
                <span className="muted">{formatDateTime(amendment.signed_at)}</span>
                <strong>{amendment.reason}</strong>
                <span>{amendment.amendment_text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No amendments. The record stands as originally signed.</p>
        )}

        {visit.workflow_status === "completed" ? (
          open ? (
            <form className="stack" onSubmit={amend}>
              <label>
                Why is this being amended?
                <input name="reason" required minLength={3} maxLength={500} />
              </label>
              <label>
                Amendment
                <textarea name="text" required rows={3} />
              </label>
              {error ? (
                <p className="error" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="actions">
                <button type="submit" disabled={busy}>
                  {busy ? "Signing…" : "Sign amendment"}
                </button>
                <button type="button" className="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="secondary" onClick={() => setOpen(true)}>
              Add an amendment
            </button>
          )
        ) : null}
      </section>
    </>
  );
}
