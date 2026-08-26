"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  PARASITE_TARGETS,
  PREVENTIVE_KINDS,
  defaultRouteFor,
  parasiteLabel,
  preventiveKindLabel,
  routeLabel,
  routesFor,
  vaccineLabel,
  vaccinesForSpecies,
  type PreventiveKind
} from "@vetkeep/domain";
import { createClient } from "@/lib/supabase/browser";
import { formatDate, readableError } from "@/lib/practice/format";
import { definedArgs, optionalText } from "@/lib/practice/rpc-args";

/**
 * Vaccination, worming and parasite control, from the web application.
 *
 * The web had none of this — it existed only on mobile, so a folder opened in a
 * browser showed no vaccination history at all, which is the single question an
 * owner asks most often.
 */

export type PreventiveEntry = {
  id: string;
  kind: string;
  vaccineType: string | null;
  productName: string;
  dateGiven: string;
  nextDueDate: string | null;
  targetParasites: string[] | null;
  serverVersion: number;
  /** Set once the consultation it belongs to has been signed. */
  locked: boolean;
};

function isOverdue(value: string | null): boolean {
  if (!value) return false;
  return new Date(`${value}T23:59:59`) < new Date();
}

export function PreventiveForm({
  patientId,
  species,
  isGroup,
  history
}: {
  patientId: string;
  species: string;
  isGroup: boolean;
  history: PreventiveEntry[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<PreventiveKind>("vaccination");
  const [parasites, setParasites] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const isVaccination = kind === "vaccination";
  const isParasiteControl = kind === "ectoparasite_control";
  const vaccines = vaccinesForSpecies(species);
  const routes = routesFor({ kind, isGroup });

  /**
   * Correcting an entry in place. The alternative was delete and re-record,
   * which loses the original and writes a deletion into the audit trail for
   * what was a typing mistake.
   */
  async function correct(entry: PreventiveEntry, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEditError(null);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const picked = PARASITE_TARGETS.filter((target) => form.get(`parasite-${target}`) === "on");

    const { error: rpcError } = await supabase.rpc(
      "update_preventive_care",
      definedArgs({
        p_id: entry.id,
        p_product_name: String(form.get("productName") ?? ""),
        p_date_given: String(form.get("dateGiven") ?? ""),
        // Carried through unchanged: required for a vaccination, refused for
        // anything else.
        p_vaccine_type: entry.vaccineType ?? undefined,
        p_batch_lot_number: optionalText(form.get("batch")),
        p_dose: optionalText(form.get("dose")),
        p_next_due_date: optionalText(form.get("nextDue")),
        p_target_parasites:
          entry.kind === "ectoparasite_control" && picked.length > 0 ? picked : undefined,
        p_base_server_version: entry.serverVersion
      })
    );

    setBusy(false);
    if (rpcError) {
      setEditError(readableError(rpcError.message));
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const supabase = createClient();

    const { error: rpcError } = await supabase.rpc(
      "record_preventive_care",
      definedArgs({
        p_id: crypto.randomUUID(),
        p_patient_id: patientId,
        p_kind: kind,
        p_product_name: String(form.get("productName") ?? ""),
        p_date_given: String(form.get("dateGiven") ?? ""),
        p_vaccine_type: isVaccination ? optionalText(form.get("vaccineType")) : undefined,
        p_manufacturer: optionalText(form.get("manufacturer")),
        p_batch_lot_number: optionalText(form.get("batch")),
        p_dose: optionalText(form.get("dose")),
        p_route: String(form.get("route") ?? defaultRouteFor({ kind, isGroup })),
        p_next_due_date: optionalText(form.get("nextDue")),
        // Only ever sent for parasite control; the server refuses it otherwise.
        p_target_parasites: isParasiteControl && parasites.length > 0 ? parasites : undefined
      })
    );

    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }

    (event.target as HTMLFormElement).reset();
    setParasites([]);
    router.refresh();
  }

  return (
    <div className="stack">
      {history.length ? (
        <ul className="record-list">
          {history.map((entry) => (
            <li key={entry.id}>
              <div className="row-head">
                <strong>
                  {entry.kind === "vaccination" && entry.vaccineType
                    ? vaccineLabel(entry.vaccineType)
                    : entry.productName}
                </strong>
                <span className="muted">{formatDate(entry.dateGiven)}</span>
              </div>
              <span className="muted">
                {preventiveKindLabel(entry.kind)}
                {entry.targetParasites?.length
                  ? ` · ${entry.targetParasites.map(parasiteLabel).join(", ")}`
                  : ""}
              </span>
              {entry.nextDueDate ? (
                <span className={isOverdue(entry.nextDueDate) ? "stock-low" : "muted"}>
                  {isOverdue(entry.nextDueDate) ? "Overdue since " : "Next due "}
                  {formatDate(entry.nextDueDate)}
                </span>
              ) : null}

              {entry.locked ? (
                <span className="muted">
                  Signed with its consultation. Correcting it now is an amendment to the record.
                </span>
              ) : editing === entry.id ? (
                <form className="stack" onSubmit={(event) => correct(entry, event)}>
                  <div className="grid">
                    <label>
                      Product
                      <input name="productName" required defaultValue={entry.productName} />
                    </label>
                    <label>
                      Date given
                      <input name="dateGiven" type="date" required defaultValue={entry.dateGiven} />
                    </label>
                  </div>
                  <div className="grid">
                    <label>
                      Batch or serial number
                      <input name="batch" />
                    </label>
                    <label>
                      Next due
                      <input name="nextDue" type="date" defaultValue={entry.nextDueDate ?? ""} />
                    </label>
                  </div>
                  {entry.kind === "ectoparasite_control" ? (
                    <fieldset className="stack">
                      <legend>What is being treated</legend>
                      {PARASITE_TARGETS.map((target) => (
                        <label key={target}>
                          <input
                            type="checkbox"
                            name={`parasite-${target}`}
                            defaultChecked={entry.targetParasites?.includes(target) ?? false}
                          />{" "}
                          {parasiteLabel(target)}
                        </label>
                      ))}
                    </fieldset>
                  ) : null}
                  {editError ? (
                    <p className="error" role="alert">
                      {editError}
                    </p>
                  ) : null}
                  <div className="grid">
                    <button type="submit" disabled={busy}>
                      {busy ? "Saving…" : "Save the correction"}
                    </button>
                    <button type="button" onClick={() => setEditing(null)} disabled={busy}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button type="button" onClick={() => setEditing(entry.id)}>
                  Correct this
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Nothing recorded yet for this animal.</p>
      )}

      <form className="stack" onSubmit={submit}>
        <label>
          Record
          <select
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as PreventiveKind)}
          >
            {PREVENTIVE_KINDS.map((value) => (
              <option key={value} value={value}>
                {preventiveKindLabel(value)}
              </option>
            ))}
          </select>
        </label>

        {isVaccination ? (
          <label>
            Vaccine
            <select name="vaccineType" defaultValue="">
              <option value="">Not listed</option>
              {vaccines.map((profile) => (
                <option key={profile.value} value={profile.value}>
                  {profile.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {isParasiteControl ? (
          <fieldset className="stack">
            <legend>What is being treated</legend>
            {/* Multi-select: one spot-on routinely covers ticks and fleas
                together, and recording only one would misstate what the animal
                is actually protected against. */}
            {PARASITE_TARGETS.map((target) => (
              <label key={target}>
                <input
                  type="checkbox"
                  checked={parasites.includes(target)}
                  onChange={() =>
                    setParasites((current) =>
                      current.includes(target)
                        ? current.filter((entry) => entry !== target)
                        : [...current, target]
                    )
                  }
                />{" "}
                {parasiteLabel(target)}
              </label>
            ))}
          </fieldset>
        ) : null}

        <div className="grid">
          <label>
            {isVaccination ? "Brand" : isParasiteControl ? "Product used" : "Dewormer used"}
            <input
              name="productName"
              required
              maxLength={160}
              placeholder={
                isVaccination
                  ? "Nobivac, Rabisin"
                  : isParasiteControl
                    ? "Frontline, Amitraz, Ivermectin"
                    : "Albendazole, Ivermectin"
              }
            />
          </label>
          <label>
            Route
            <select name="route" defaultValue={defaultRouteFor({ kind, isGroup })}>
              {routes.map((value) => (
                <option key={value} value={value}>
                  {routeLabel(value)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid">
          <label>
            Date given
            <input name="dateGiven" type="date" required />
          </label>
          <label>
            Next due (optional)
            <input name="nextDue" type="date" />
          </label>
        </div>

        <div className="grid">
          <label>
            Batch or serial number
            <input name="batch" maxLength={80} placeholder="Asked for after a vaccine failure" />
          </label>
          <label>
            Dose given
            <input name="dose" maxLength={60} placeholder="1 ml" />
          </label>
        </div>

        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={busy}>
          {busy ? "Recording…" : "Record it"}
        </button>
      </form>
    </div>
  );
}
