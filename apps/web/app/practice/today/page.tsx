import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/practice/format";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const supabase = await createClient();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const { data: stops, error } = await supabase
    .from("appointments")
    .select(
      "id, status, scheduled_start, visit_address, reason_for_visit, visit_id, appointment_type, clients(name, phone_display), patients(name, species)"
    )
    .is("deleted_at", null)
    .in("status", ["confirmed", "rescheduled"])
    .gte("scheduled_start", startOfDay.toISOString())
    .lt("scheduled_start", endOfDay.toISOString())
    .order("scheduled_start", { ascending: true });

  if (error) throw new Error("Unable to load today's visits.");

  return (
    <section className="card stack">
      <h1>Today</h1>
      <p className="muted">{startOfDay.toLocaleDateString(undefined, { dateStyle: "full" })}</p>

      {stops?.length ? (
        <ol className="route-list">
          {stops.map((stop, index) => (
            <li key={stop.id}>
              <span className="stop-index">{index + 1}</span>
              <div className="stop-body">
                <div className="row-head">
                  <strong>{stop.patients?.name ?? "Unknown animal"}</strong>
                  <span className="muted">{formatDateTime(stop.scheduled_start)}</span>
                </div>
                <span className="muted">
                  {stop.clients?.name ?? "Unknown client"}
                  {stop.clients?.phone_display ? ` · ${stop.clients.phone_display}` : ""}
                </span>
                {stop.visit_address ? <span className="muted">{stop.visit_address}</span> : null}
                {stop.reason_for_visit ? <span>{stop.reason_for_visit}</span> : null}
                {stop.visit_id ? (
                  <Link href={`/practice/visits/${stop.visit_id}`}>Open visit record</Link>
                ) : (
                  <Link href="/practice/appointments">Start this visit</Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">
          No confirmed visits today. Check <Link href="/practice/appointments">appointments</Link>{" "}
          for open requests.
        </p>
      )}
    </section>
  );
}
