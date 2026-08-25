import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewRecordForm } from "./new-record-form";
import { PassportForm, type PassportState } from "./passport-form";
import { PreventiveForm, type PreventiveEntry } from "./preventive-form";
import { formatDate, formatDateTime } from "@/lib/practice/format";

export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: patient, error } = await supabase
    .from("patients")
    .select(
      "id, patient_code, name, species, breed, sex, date_of_birth, status, microchip_id, kind, purpose, head_count"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error("Unable to load the animal.");
  if (!patient) notFound();

  const { data: owner } = await supabase
    .from("patient_owners")
    .select("client_id, clients(id, name, phone_display)")
    .eq("patient_id", id)
    .is("deleted_at", null)
    .is("valid_to", null)
    .eq("is_primary", true)
    .maybeSingle();

  // The timeline is the point of this page: what happened to this animal, in order.
  const { data: visits } = await supabase
    .from("visits")
    .select(
      "id, visit_date, visit_type, workflow_status, chief_complaint, definitive_diagnosis, next_review_date"
    )
    .eq("patient_id", id)
    .is("deleted_at", null)
    .order("visit_date", { ascending: false });

  const { data: preventiveRows } = await supabase
    .from("preventive_care")
    .select("id, kind, vaccine_type, product_name, date_given, next_due_date, target_parasites")
    .eq("patient_id", id)
    .is("deleted_at", null)
    .order("date_given", { ascending: false });

  const preventive: PreventiveEntry[] = (preventiveRows ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    vaccineType: row.vaccine_type,
    productName: row.product_name,
    dateGiven: row.date_given,
    nextDueDate: row.next_due_date,
    targetParasites: row.target_parasites
  }));

  const { data: passportRow } = await supabase
    .from("patient_passports")
    .select("id, enabled, owner_name_visibility, show_microchip")
    .eq("patient_id", id)
    .maybeSingle();

  let passportViews = 0;
  if (passportRow) {
    const { count } = await supabase
      .from("passport_access_events")
      .select("id", { count: "exact", head: true })
      .eq("passport_id", passportRow.id);
    passportViews = count ?? 0;
  }

  const passport: PassportState = passportRow
    ? {
        enabled: passportRow.enabled,
        ownerNameVisibility: passportRow.owner_name_visibility,
        showMicrochip: passportRow.show_microchip
      }
    : null;

  // Follow-up intent lives on the record, not in a booking (brief §11). What is
  // "due" is a review date a veterinarian wrote down, not a slot anyone agreed.
  const { data: due } = await supabase
    .from("visits")
    .select("id, next_review_date, follow_up_plan, visit_date")
    .eq("patient_id", id)
    .is("deleted_at", null)
    .not("next_review_date", "is", null)
    .gte("next_review_date", new Date().toISOString().slice(0, 10))
    .order("next_review_date", { ascending: true });

  return (
    <>
      <section className="card stack">
        {owner?.clients ? (
          <p className="muted">
            <Link href={`/practice/clients/${owner.clients.id}`}>← {owner.clients.name}</Link>
          </p>
        ) : null}
        <div className="row-head">
          <h1>{patient.name}</h1>
          <span className={`pill pill-${patient.status}`}>{patient.status}</span>
        </div>
        <p className="code-line">
          <span className="code">{patient.patient_code}</span>
        </p>
        <p>
          {patient.species}
          {patient.breed ? ` · ${patient.breed}` : ""}
          {/* A group carries no single sex, and a head count instead. */}
          {patient.sex ? ` · ${patient.sex.replace("_", " ")}` : ""}
          {patient.head_count !== null ? ` · ${patient.head_count} head` : ""}
        </p>
        {patient.date_of_birth ? (
          <p className="muted">Born {formatDate(patient.date_of_birth)}</p>
        ) : null}
        {patient.microchip_id ? (
          <p className="muted">
            Microchip <span className="code">{patient.microchip_id}</span>
          </p>
        ) : null}
      </section>

      <section className="card stack">
        <h2>Due for review</h2>
        {due?.length ? (
          <ul className="record-list">
            {due.map((review) => (
              <li key={review.id}>
                <div className="row-head">
                  <strong>{formatDate(review.next_review_date as string)}</strong>
                  <Link href={`/practice/visits/${review.id}`}>
                    from the record of {formatDate(review.visit_date)}
                  </Link>
                </div>
                {review.follow_up_plan ? (
                  <span className="muted">{review.follow_up_plan}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            Nothing due. A review date is set on a record during the consultation, on the phone.
          </p>
        )}
      </section>

      <section className="card stack">
        <h2>Start a record</h2>
        <p className="muted">
          A consultation is created by attending. Records are normally written on the phone beside
          the animal, but a folder you can read and never add to is a filing cabinet.
        </p>
        <NewRecordForm patientId={patient.id} />
      </section>

      <section className="card stack">
        <h2>Vaccination, worming and parasites</h2>
        <PreventiveForm
          patientId={patient.id}
          species={patient.species}
          isGroup={patient.kind === "group"}
          history={preventive}
        />
      </section>

      <section className="card stack">
        <h2>Public health passport</h2>
        <PassportForm
          patientId={patient.id}
          patientName={patient.name}
          passport={passport}
          views={passportViews}
        />
      </section>

      <section className="card stack">
        <h2>History</h2>
        {visits?.length ? (
          <ul className="record-list">
            {visits.map((visit) => (
              <li key={visit.id}>
                <Link href={`/practice/visits/${visit.id}`}>
                  <strong>{formatDateTime(visit.visit_date)}</strong>
                  <span className={`pill pill-${visit.workflow_status}`}>
                    {visit.workflow_status}
                  </span>
                </Link>
                <span className="muted">{visit.visit_type.replace("_", " ")}</span>
                {visit.chief_complaint ? <span>{visit.chief_complaint}</span> : null}
                {visit.definitive_diagnosis ? (
                  <span className="muted">Diagnosis: {visit.definitive_diagnosis}</span>
                ) : null}
                {visit.next_review_date ? (
                  <span className="muted">Review due {formatDate(visit.next_review_date)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No visits recorded for this animal yet.</p>
        )}
      </section>
    </>
  );
}
