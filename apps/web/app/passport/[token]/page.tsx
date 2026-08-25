import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

/**
 * The public health passport (brief §10).
 *
 * The only page in VetKeep a stranger can open. It exists so a groomer, a
 * boarding kennel or a buyer can check that an animal is who it is said to be
 * and that its vaccinations are current — and for nothing else.
 *
 * Everything shown here comes from one database function that assembles an
 * allow-listed document. This page never queries a table, so it cannot widen
 * what is public by adding a field: there is no field to add.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Animal health passport",
  // §10.4 item 6. Also sent as a header in next.config.ts, because a crawler
  // that ignores one may respect the other.
  robots: { index: false, follow: false, nocache: true }
};

type Vaccination = {
  vaccine: string | null;
  product_name: string | null;
  date_given: string | null;
  next_due_date: string | null;
};

type Deworming = {
  product_name: string | null;
  date_given: string | null;
  next_due_date: string | null;
};

type ParasiteControl = {
  product_name: string | null;
  target_parasites: string[] | null;
  date_given: string | null;
  next_due_date: string | null;
};

type Care = {
  visit_date: string | null;
  reason: string | null;
  diagnosis: string | null;
};

type Passport = {
  animal: {
    name: string | null;
    patient_code: string | null;
    species: string | null;
    breed: string | null;
    sex: string | null;
    date_of_birth: string | null;
    date_of_birth_precision: string | null;
    color_markings: string | null;
    kind: string | null;
    head_count: number | null;
    microchip_id: string | null;
  };
  owner_name: string | null;
  vaccinations: Vaccination[];
  dewormings: Deworming[];
  parasite_control: ParasiteControl[];
  recent_care: Care[];
  verified_by: {
    veterinarian: string | null;
    business_name: string | null;
    licence_verified: boolean | null;
  };
  last_updated: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

/** A due date in the past is the one thing on this page somebody acts on. */
function isOverdue(value: string | null): boolean {
  if (!value) return false;
  return new Date(`${value}T23:59:59`) < new Date();
}

export default async function PassportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();

  const { data } = await supabase.rpc("passport_by_token", { p_token: token });
  const passport = data as Passport | null;

  // Unknown, revoked, disabled and never-consented are one page. Telling them
  // apart would let somebody probe for passports that used to exist.
  if (!passport) {
    return (
      <main className="stack">
        <section className="card stack">
          <h1>This passport is not available</h1>
          <p className="muted">
            The link may be out of date, or the veterinarian may have withdrawn it. Ask whoever gave
            you this link for a current one.
          </p>
        </section>
      </main>
    );
  }

  const { animal, verified_by: verifiedBy } = passport;
  const isGroup = animal.kind === "group";

  return (
    <main className="stack">
      <section className="card stack">
        <p className="muted">Animal health passport</p>
        <h1>{animal.name ?? "Unnamed animal"}</h1>
        <p className="code-line">
          <span className="code">{animal.patient_code}</span>
        </p>
        <p>
          {animal.species}
          {animal.breed ? ` · ${animal.breed}` : ""}
          {animal.sex ? ` · ${animal.sex.replace("_", " ")}` : ""}
          {isGroup && animal.head_count !== null ? ` · ${animal.head_count} head` : ""}
        </p>
        {animal.color_markings ? <p className="muted">{animal.color_markings}</p> : null}
        {animal.date_of_birth ? (
          <p className="muted">
            Born {formatDate(animal.date_of_birth)}
            {animal.date_of_birth_precision && animal.date_of_birth_precision !== "exact"
              ? ` (${animal.date_of_birth_precision})`
              : ""}
          </p>
        ) : null}
        {/* Only when the veterinarian deliberately enabled it. */}
        {animal.microchip_id ? (
          <p className="muted">
            Microchip <span className="code">{animal.microchip_id}</span>
          </p>
        ) : null}
        {passport.owner_name ? <p className="muted">Owner: {passport.owner_name}</p> : null}
      </section>

      <section className="card stack">
        <h2>Vaccinations</h2>
        {passport.vaccinations.length ? (
          <ul className="record-list">
            {passport.vaccinations.map((vaccination, index) => (
              <li key={`${vaccination.date_given}-${index}`}>
                <div className="row-head">
                  <strong>
                    {vaccination.vaccine ?? vaccination.product_name ?? "Vaccination"}
                  </strong>
                  <span className="muted">{formatDate(vaccination.date_given)}</span>
                </div>
                {vaccination.next_due_date ? (
                  <span className={isOverdue(vaccination.next_due_date) ? "stock-low" : "muted"}>
                    {isOverdue(vaccination.next_due_date) ? "Overdue since " : "Next due "}
                    {formatDate(vaccination.next_due_date)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No vaccinations recorded on this passport.</p>
        )}
      </section>

      <section className="card stack">
        <h2>Worming</h2>
        {passport.dewormings.length ? (
          <ul className="record-list">
            {passport.dewormings.map((entry, index) => (
              <li key={`${entry.date_given}-${index}`}>
                <div className="row-head">
                  <strong>{entry.product_name ?? "Dewormer"}</strong>
                  <span className="muted">{formatDate(entry.date_given)}</span>
                </div>
                {entry.next_due_date ? (
                  <span className={isOverdue(entry.next_due_date) ? "stock-low" : "muted"}>
                    {isOverdue(entry.next_due_date) ? "Overdue since " : "Next due "}
                    {formatDate(entry.next_due_date)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No worming recorded on this passport.</p>
        )}
      </section>

      <section className="card stack">
        <h2>Ticks, fleas and mites</h2>
        {passport.parasite_control.length ? (
          <ul className="record-list">
            {passport.parasite_control.map((entry, index) => (
              <li key={`${entry.date_given}-${index}`}>
                <div className="row-head">
                  <strong>{entry.product_name ?? "Parasite control"}</strong>
                  <span className="muted">{formatDate(entry.date_given)}</span>
                </div>
                {entry.target_parasites?.length ? (
                  <span>{entry.target_parasites.join(", ")}</span>
                ) : null}
                {entry.next_due_date ? (
                  <span className={isOverdue(entry.next_due_date) ? "stock-low" : "muted"}>
                    {isOverdue(entry.next_due_date) ? "Overdue since " : "Next due "}
                    {formatDate(entry.next_due_date)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No parasite control recorded on this passport.</p>
        )}
      </section>

      {passport.recent_care.length ? (
        <section className="card stack">
          <h2>Recent care</h2>
          {/* Three fields per visit, and only for visits the veterinarian
              published. Never the notes, examination or prescriptions. */}
          <ul className="record-list">
            {passport.recent_care.map((care, index) => (
              <li key={`${care.visit_date}-${index}`}>
                <div className="row-head">
                  <strong>{formatDate(care.visit_date)}</strong>
                </div>
                {care.reason ? <span>{care.reason}</span> : null}
                {care.diagnosis ? <span className="muted">{care.diagnosis}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card stack">
        <h2>Verified by</h2>
        <p>
          <strong>{verifiedBy.veterinarian}</strong>
          {verifiedBy.business_name ? ` · ${verifiedBy.business_name}` : ""}
        </p>
        <p className={verifiedBy.licence_verified ? "muted" : "warning"}>
          {verifiedBy.licence_verified
            ? "Veterinary licence verified by VetKeep."
            : "Licence verification pending."}
        </p>
        <p className="muted">Last updated {formatDate(passport.last_updated)}</p>
        <p className="muted">
          This is a summary of identity and vaccination status. It is not a medical record. For
          clinical history, ask the owner or the veterinarian above.
        </p>
      </section>
    </main>
  );
}
