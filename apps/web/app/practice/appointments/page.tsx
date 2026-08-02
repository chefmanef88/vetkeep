import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/practice/format";
import { AppointmentActions } from "./appointment-actions";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["requested", "confirmed", "rescheduled"];

export default async function AppointmentsPage() {
  const supabase = await createClient();

  const { data: appointments, error } = await supabase
    .from("appointments")
    .select(
      "id, appointment_type, status, scheduled_start, visit_address, reason_for_visit, visit_id, clients(name), patients(name)"
    )
    .is("deleted_at", null)
    .order("scheduled_start", { ascending: true, nullsFirst: false });

  if (error) throw new Error("Unable to load appointments.");

  const open = (appointments ?? []).filter((row) => OPEN_STATUSES.includes(row.status));
  const closed = (appointments ?? []).filter((row) => !OPEN_STATUSES.includes(row.status));

  return (
    <>
      <section className="card stack">
        <h1>Appointments</h1>
        <p className="muted">
          A request becomes a visit once you confirm the time and arrive. Nothing is booked without
          your confirmation.
        </p>
        {open.length ? (
          <ul className="record-list">
            {open.map((row) => (
              <li key={row.id}>
                <div className="row-head">
                  <strong>{row.patients?.name ?? "Unknown animal"}</strong>
                  <span className={`pill pill-${row.status}`}>{row.status}</span>
                </div>
                <span className="muted">
                  {row.clients?.name ?? "Unknown client"} · {formatDateTime(row.scheduled_start)}
                </span>
                {row.reason_for_visit ? (
                  <span className="muted">{row.reason_for_visit}</span>
                ) : null}
                {row.visit_address ? <span className="muted">{row.visit_address}</span> : null}
                <AppointmentActions
                  appointmentId={row.id}
                  status={row.status}
                  visitId={row.visit_id}
                  appointmentType={row.appointment_type}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            Nothing open. Request a house call from a <Link href="/practice/clients">client</Link>.
          </p>
        )}
      </section>

      {closed.length ? (
        <section className="card stack">
          <h2>Closed</h2>
          <ul className="record-list">
            {closed.map((row) => (
              <li key={row.id}>
                <div className="row-head">
                  <strong>{row.patients?.name ?? "Unknown animal"}</strong>
                  <span className={`pill pill-${row.status}`}>{row.status}</span>
                </div>
                <span className="muted">
                  {row.clients?.name ?? "Unknown client"} · {formatDateTime(row.scheduled_start)}
                </span>
                {row.visit_id ? (
                  <Link href={`/practice/visits/${row.visit_id}`}>Open the visit record</Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
