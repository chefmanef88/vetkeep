import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/practice/format";
import { VisitEditor } from "./visit-editor";
import { CompletedVisit } from "./completed-visit";

export const dynamic = "force-dynamic";

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: visit, error } = await supabase
    .from("visits")
    .select("*, patients(id, name, species, breed, patient_code)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error("Unable to load the visit.");
  if (!visit) notFound();

  const { data: findings } = await supabase
    .from("physical_exam_findings")
    .select("id, system_name, status, remarks")
    .eq("visit_id", id)
    .order("system_name", { ascending: true });

  const { data: amendments } = await supabase
    .from("visit_amendments")
    .select("id, reason, amendment_text, signed_at")
    .eq("visit_id", id)
    .order("signed_at", { ascending: true });

  const { data: invoice } = await supabase
    .from("visit_invoices")
    .select("id, invoice_number, status, total_pesewas, amount_paid_pesewas, currency")
    .eq("visit_id", id)
    .is("deleted_at", null)
    .maybeSingle();

  const isDraft = visit.workflow_status === "draft";

  return (
    <>
      <section className="card stack">
        <p className="muted">
          <Link href="/practice/today">← Today</Link>
        </p>
        <div className="row-head">
          <h1>{visit.patients?.name ?? "Visit"}</h1>
          <span className={`pill pill-${visit.workflow_status}`}>{visit.workflow_status}</span>
        </div>
        <p className="muted">
          {visit.patients?.species}
          {visit.patients?.breed ? ` · ${visit.patients.breed}` : ""} ·{" "}
          <span className="code">{visit.patients?.patient_code}</span>
        </p>
        <p className="muted">
          {visit.visit_type.replace("_", " ")} · {formatDateTime(visit.visit_date)}
        </p>
        {visit.workflow_status === "completed" ? (
          <p className="muted">
            Signed {formatDateTime(visit.signed_at)}. This record is now fixed.
          </p>
        ) : null}
        {visit.workflow_status === "voided" ? (
          <p className="error">Voided: {visit.void_reason}</p>
        ) : null}
      </section>

      {isDraft ? (
        <VisitEditor
          visitId={visit.id}
          initial={{
            visitDate: visit.visit_date,
            visitType: visit.visit_type,
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
            nextReviewDate: visit.next_review_date ?? ""
          }}
          findings={findings ?? []}
        />
      ) : (
        <CompletedVisit visit={visit} findings={findings ?? []} amendments={amendments ?? []} />
      )}

      <section className="card stack">
        <h2>Charges</h2>
        {invoice ? (
          <>
            <p>
              <Link href={`/practice/invoices/${invoice.id}`}>
                <span className="code">{invoice.invoice_number}</span>
              </Link>{" "}
              · <span className={`pill pill-${invoice.status}`}>{invoice.status}</span>
            </p>
            <p className="muted">
              {invoice.currency} {(invoice.total_pesewas / 100).toFixed(2)} total ·{" "}
              {invoice.currency} {(invoice.amount_paid_pesewas / 100).toFixed(2)} paid
            </p>
          </>
        ) : (
          <p className="muted">
            No invoice yet.{" "}
            <Link href={`/practice/invoices/new?visitId=${visit.id}&patientId=${visit.patient_id}`}>
              Create one
            </Link>
            .
          </p>
        )}
      </section>
    </>
  );
}
