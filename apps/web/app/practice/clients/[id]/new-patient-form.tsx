"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { SPECIES, callWithFreshCode, generatePatientCode, speciesProfile } from "@vetkeep/domain";
import { createClient } from "@/lib/supabase/browser";
import { readableError } from "@/lib/practice/format";
import { definedArgs, optionalText } from "@/lib/practice/rpc-args";

const SEXES = [
  { value: "female", label: "Female" },
  { value: "female_spayed", label: "Female, spayed" },
  { value: "male", label: "Male" },
  { value: "male_neutered", label: "Male, neutered" },
  { value: "unknown", label: "Unknown" }
];

export function NewPatientForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const patientId = crypto.randomUUID();

    // Re-minted if the code is already taken; it has been shown to nobody yet.
    const { error: patientError } = await callWithFreshCode(generatePatientCode, (code) =>
      supabase.rpc(
        "create_patient",
        definedArgs({
          p_id: patientId,
          p_patient_code: code,
          p_name: String(form.get("name") ?? ""),
          p_species: String(form.get("species") ?? ""),
          p_sex: String(form.get("sex") ?? "unknown"),
          p_breed: optionalText(form.get("breed")),
          p_date_of_birth: optionalText(form.get("dateOfBirth")),
          p_date_of_birth_precision: optionalText(form.get("dobPrecision")),
          p_color_markings: optionalText(form.get("colorMarkings")),
          p_microchip_id: optionalText(form.get("microchipId"))
        })
      )
    );

    if (patientError) {
      setBusy(false);
      setError(readableError(patientError.message));
      return;
    }

    // Creating the animal and recording who owns it are two calls. If the second
    // fails the animal still exists unowned rather than being lost, and the vet
    // is told plainly which half succeeded.
    const { error: ownerError } = await supabase.rpc("create_patient_owner", {
      p_id: crypto.randomUUID(),
      p_patient_id: patientId,
      p_client_id: clientId,
      p_is_primary: true
    });

    setBusy(false);
    if (ownerError) {
      setError(
        `The animal was saved, but linking it to this client failed: ${readableError(ownerError.message)}`
      );
      router.refresh();
      return;
    }

    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="grid">
        <label>
          Name
          <input name="name" required maxLength={160} />
        </label>
        <label>
          Species
          {/* A list rather than a text box. The old input took free text with a
              placeholder of "Dog", which the database rejected for its capital
              letter — an interface that asks for something it will refuse. */}
          <select name="species" required defaultValue="dog">
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
          <input name="breed" maxLength={120} />
        </label>
        <label>
          Sex
          <select name="sex" required defaultValue="unknown">
            {SEXES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid">
        <label>
          Date of birth
          <input name="dateOfBirth" type="date" />
        </label>
        <label>
          How exact is that?
          <select name="dobPrecision" defaultValue="exact">
            <option value="exact">Exact date</option>
            <option value="month">Month known</option>
            <option value="year">Year known</option>
            <option value="estimated">Estimated</option>
          </select>
        </label>
      </div>

      <div className="grid">
        <label>
          Colour and markings
          <input
            name="colorMarkings"
            maxLength={300}
            placeholder="Brindle, white chest, torn left ear"
          />
        </label>
        <label>
          Microchip number
          <input name="microchipId" maxLength={60} placeholder="900123456789012" />
        </label>
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Add animal"}
      </button>
    </form>
  );
}
