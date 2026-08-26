"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SPECIES, speciesProfile } from "@vetkeep/domain";
import { createClient } from "@/lib/supabase/browser";
import { readableError } from "@/lib/practice/format";
import { definedArgs, optionalText } from "@/lib/practice/rpc-args";

/**
 * Correcting an animal's standing details.
 *
 * update_patient existed from Phase 2 and was never wired to anything. A
 * microchip number typed wrong, a date of birth learned later, a colour
 * description that turned out to describe the wrong dog — none of it could be
 * fixed.
 *
 * Standing information is editable for the life of the folder (brief §6). What
 * is frozen is the consultation record, once signed, and that is a different
 * table.
 */

const SEXES = [
  { value: "female", label: "Female" },
  { value: "female_spayed", label: "Female, spayed" },
  { value: "male", label: "Male" },
  { value: "male_neutered", label: "Male, neutered" },
  { value: "unknown", label: "Unknown" }
];

const PRECISIONS = [
  { value: "exact", label: "Exact date" },
  { value: "month", label: "Month known" },
  { value: "year", label: "Year known" },
  { value: "estimated", label: "Estimated" }
];

export type EditablePatient = {
  id: string;
  name: string;
  species: string;
  kind: string;
  purpose: string;
  sex: string | null;
  breed: string | null;
  date_of_birth: string | null;
  date_of_birth_precision: string | null;
  color_markings: string | null;
  microchip_id: string | null;
  ear_tag: string | null;
  head_count: number | null;
  status: string;
  server_version: number;
};

export function EditPatientForm({ patient }: { patient: EditablePatient }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isGroup = patient.kind === "group";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const supabase = createClient();

    const { error: rpcError } = await supabase.rpc(
      "update_patient",
      definedArgs({
        p_id: patient.id,
        p_name: String(form.get("name") ?? ""),
        p_species: String(form.get("species") ?? patient.species),
        // Neither of these is edited here. An individual that becomes a group,
        // or a pet that becomes a food animal, changes which clinical rules
        // apply to every record already in the folder.
        p_kind: patient.kind,
        p_purpose: patient.purpose,
        p_sex: optionalText(form.get("sex")),
        p_breed: optionalText(form.get("breed")),
        p_date_of_birth: optionalText(form.get("dateOfBirth")),
        p_date_of_birth_precision: optionalText(form.get("dobPrecision")),
        p_color_markings: optionalText(form.get("colorMarkings")),
        p_microchip_id: optionalText(form.get("microchipId")),
        p_ear_tag: optionalText(form.get("earTag")),
        p_head_count: isGroup ? Number(form.get("headCount") ?? 0) || undefined : undefined,
        p_status: patient.status,
        p_base_server_version: patient.server_version
      })
    );

    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Edit these details
      </button>
    );
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="grid">
        <label>
          Name
          <input name="name" required maxLength={120} defaultValue={patient.name} />
        </label>
        <label>
          Species
          <select name="species" defaultValue={patient.species}>
            {SPECIES.map((value) => (
              <option key={value} value={value}>
                {speciesProfile(value).label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid">
        <label>
          Breed
          <input name="breed" maxLength={120} defaultValue={patient.breed ?? ""} />
        </label>
        {isGroup ? (
          <label>
            Head count
            <input name="headCount" inputMode="numeric" defaultValue={patient.head_count ?? ""} />
          </label>
        ) : (
          <label>
            Sex
            <select name="sex" defaultValue={patient.sex ?? "unknown"}>
              {SEXES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="grid">
        <label>
          Date of birth
          <input name="dateOfBirth" type="date" defaultValue={patient.date_of_birth ?? ""} />
        </label>
        <label>
          How exact is that?
          <select name="dobPrecision" defaultValue={patient.date_of_birth_precision ?? "exact"}>
            {PRECISIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Colour and markings
        <input
          name="colorMarkings"
          maxLength={300}
          defaultValue={patient.color_markings ?? ""}
          placeholder="Brindle, white chest, torn left ear"
        />
      </label>

      <div className="grid">
        <label>
          Microchip number
          <input name="microchipId" maxLength={60} defaultValue={patient.microchip_id ?? ""} />
        </label>
        <label>
          Ear tag
          <input name="earTag" maxLength={60} defaultValue={patient.ear_tag ?? ""} />
        </label>
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid">
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
