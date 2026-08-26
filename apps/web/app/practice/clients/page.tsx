import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewClientForm } from "./new-client-form";

export const dynamic = "force-dynamic";

/**
 * Clients and their animals, searchable.
 *
 * The list was ordered newest-first with no way to search it, which works for a
 * week and then stops: a veterinarian looking for "Kwame" or for the dog called
 * "Simba" had to scroll. The search runs across both — a person is as likely to
 * remember the animal's name as the owner's, and the code is what gets read
 * down a telephone.
 */
export default async function ClientsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = (q ?? "").trim();
  const supabase = await createClient();

  let clientQuery = supabase
    .from("clients")
    .select("id, client_code, name, phone_display, address")
    .is("deleted_at", null);

  if (term) {
    // Name, code or phone: the three things anybody actually remembers.
    const pattern = `%${term}%`;
    clientQuery = clientQuery.or(
      `name.ilike.${pattern},client_code.ilike.${pattern},phone_display.ilike.${pattern}`
    );
  }

  const { data: clients, error } = await clientQuery.order("name", { ascending: true });
  if (error) throw new Error("Unable to load clients.");

  // Animals are searched separately rather than through an embed: a folder is
  // reached directly, and matching a dog should not depend on also matching its
  // owner.
  let animals: { id: string; name: string; patient_code: string; species: string }[] = [];
  if (term) {
    const pattern = `%${term}%`;
    const { data } = await supabase
      .from("patients")
      .select("id, name, patient_code, species")
      .is("deleted_at", null)
      .or(`name.ilike.${pattern},patient_code.ilike.${pattern},microchip_id.ilike.${pattern}`)
      .order("name", { ascending: true });
    animals = data ?? [];
  }

  return (
    <>
      <section className="card stack">
        <h1>Clients</h1>
        <p className="muted">
          The people whose animals you treat. Each one carries a code you can read over the phone.
        </p>

        {/* A plain GET form: the search survives a refresh and can be shared or
            bookmarked, which a client-side filter would not. */}
        <form className="stack" method="get">
          <label>
            Search
            <input
              name="q"
              defaultValue={term}
              placeholder="Owner, animal, code, phone or microchip"
            />
          </label>
          <div className="grid">
            <button type="submit">Search</button>
            {term ? <Link href="/practice/clients">Clear</Link> : null}
          </div>
        </form>

        {term ? (
          <p className="muted">
            {clients?.length ?? 0} client{(clients?.length ?? 0) === 1 ? "" : "s"} and{" "}
            {animals.length} animal{animals.length === 1 ? "" : "s"} matching &ldquo;{term}&rdquo;.
          </p>
        ) : null}

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
          <p className="muted">
            {term ? "No client matches that." : "No clients yet. Add the first one below."}
          </p>
        )}
      </section>

      {term && animals.length ? (
        <section className="card stack">
          <h2>Animals</h2>
          <ul className="record-list">
            {animals.map((animal) => (
              <li key={animal.id}>
                <Link href={`/practice/patients/${animal.id}`}>
                  <strong>{animal.name}</strong>
                  <span className="code">{animal.patient_code}</span>
                </Link>
                <span className="muted">{animal.species}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card stack">
        <h2>Add a client</h2>
        <NewClientForm />
      </section>
    </>
  );
}
