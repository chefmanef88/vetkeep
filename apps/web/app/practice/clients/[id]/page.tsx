import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewPatientForm } from "./new-patient-form";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client, error } = await supabase
    .from("clients")
    .select("id, client_code, name, phone_display, phone_e164, address, communication_consent")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error("Unable to load the client.");
  if (!client) notFound();

  // Patients reach a client through the ownership table, because a pet can change
  // hands and the history of who cared for it has to survive that.
  const { data: ownerships } = await supabase
    .from("patient_owners")
    .select("id, is_primary, valid_to, patients(id, patient_code, name, species, breed, sex)")
    .eq("client_id", id)
    .is("deleted_at", null)
    .is("valid_to", null);

  const patients = (ownerships ?? [])
    .map((row) => ({ ...row, patient: row.patients }))
    .filter((row) => row.patient !== null);

  return (
    <>
      <section className="card stack">
        <p className="muted">
          <Link href="/practice/clients">← All clients</Link>
        </p>
        <h1>{client.name}</h1>
        <p className="code-line">
          <span className="code">{client.client_code}</span>
        </p>
        <p>
          {client.phone_display} · {client.phone_e164}
        </p>
        {client.address ? <p className="muted">{client.address}</p> : null}
        <p className="muted">
          Reminders: {client.communication_consent ? "consented" : "not consented"}
        </p>
      </section>

      <section className="card stack">
        <h2>Animals</h2>
        {patients.length ? (
          <ul className="record-list">
            {patients.map((row) => (
              <li key={row.id}>
                <Link href={`/practice/patients/${row.patient!.id}`}>
                  <strong>{row.patient!.name}</strong>
                  <span className="code">{row.patient!.patient_code}</span>
                </Link>
                <span className="muted">
                  {row.patient!.species}
                  {row.patient!.breed ? ` · ${row.patient!.breed}` : ""} · {row.patient!.sex}
                  {row.is_primary ? " · primary owner" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No animals recorded for this client yet.</p>
        )}
      </section>

      <section className="card stack">
        <h2>Add an animal</h2>
        <NewPatientForm clientId={client.id} />
      </section>
    </>
  );
}
