import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewClientForm } from "./new-client-form";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = await createClient();

  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, client_code, name, phone_display, address")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error("Unable to load clients.");

  return (
    <>
      <section className="card stack">
        <h1>Clients</h1>
        <p className="muted">
          The people whose animals you treat. Each one carries a code you can read over the phone.
        </p>
        {clients?.length ? (
          <ul className="record-list">
            {clients.map((client) => (
              <li key={client.id}>
                <Link href={`/practice/clients/${client.id}`}>
                  <strong>{client.name}</strong>
                  <span className="code">{client.client_code}</span>
                </Link>
                <span className="muted">
                  {client.phone_display}
                  {client.address ? ` · ${client.address}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No clients yet. Add the first one below.</p>
        )}
      </section>

      <section className="card stack">
        <h2>Add a client</h2>
        <NewClientForm />
      </section>
    </>
  );
}
