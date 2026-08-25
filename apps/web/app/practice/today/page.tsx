import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/practice/format";

export const dynamic = "force-dynamic";

/**
 * What was attended today.
 *
 * This page used to list confirmed appointments, which assumed work arrives
 * through the application. It does not: the veterinarian is telephoned, agrees
 * a time on the call, and drives (brief §11). So "today" is not a plan to be
 * worked through — it is the records written today, with the open ones first,
 * because an unsigned record is the only thing on this page that still needs
 * something doing to it.
 */
export default async function TodayPage() {
  const supabase = await createClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const { data: records, error } = await supabase
    .from("visits")
    .select(
      // patients is embedded once. An earlier version also embedded it a second
      // time under an alias to reach the owner — clients:patients(clients(...)) —
      // which PostgREST rejects, and which nothing on this page ever rendered.
      // The owner's name belongs on the folder, not on a list of today's work.
      "id, visit_date, visit_type, workflow_status, chief_complaint, patients(name, species, patient_code)"
    )
    .is("deleted_at", null)
    .gte("visit_date", startOfDay.toISOString())
    .lt("visit_date", endOfDay.toISOString())
    .order("visit_date", { ascending: false });

  if (error) throw new Error("Unable to load today's records.");

  // Drafts first: they are the only rows here that are not finished.
  const ordered = [...(records ?? [])].sort((a, b) => {
    const aDraft = a.workflow_status === "draft" ? 0 : 1;
    const bDraft = b.workflow_status === "draft" ? 0 : 1;
    return aDraft - bDraft;
  });

  return (
    <section className="card stack">
      <h1>Today</h1>
      <p className="muted">{startOfDay.toLocaleDateString(undefined, { dateStyle: "full" })}</p>

      {ordered.length ? (
        <ol className="route-list">
          {ordered.map((record, index) => (
            <li key={record.id}>
              <span className="stop-index">{index + 1}</span>
              <div className="stop-body">
                <div className="row-head">
                  <strong>{record.patients?.name ?? "Unknown animal"}</strong>
                  <span className="muted">{formatDateTime(record.visit_date)}</span>
                </div>
                <span className="muted">
                  {record.patients?.patient_code ?? ""}
                  {record.patients?.species ? ` · ${record.patients.species}` : ""}
                  {record.visit_type ? ` · ${record.visit_type.replace("_", " ")}` : ""}
                </span>
                {record.chief_complaint ? <span>{record.chief_complaint}</span> : null}
                <div className="row-head">
                  <span className={`pill pill-${record.workflow_status}`}>
                    {record.workflow_status}
                  </span>
                  <Link href={`/practice/visits/${record.id}`}>
                    {record.workflow_status === "draft" ? "Finish this record" : "Open record"}
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">
          Nothing recorded today. Records are written on the phone during a visit; open a{" "}
          <Link href="/practice/clients">client</Link> to see their folders.
        </p>
      )}
    </section>
  );
}
