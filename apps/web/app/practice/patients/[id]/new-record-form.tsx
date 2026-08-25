"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { generateVisitRecordCode } from "@vetkeep/domain";
import { createClient } from "@/lib/supabase/browser";
import { readableError } from "@/lib/practice/format";
import { definedArgs, optionalText } from "@/lib/practice/rpc-args";

/**
 * Starting a consultation record from the web application.
 *
 * This existed only on mobile, which is right for where the work happens — a
 * record is written standing next to the animal. But it left a veterinarian
 * without their phone unable to open a record at all, and a folder that can be
 * read but never added to is a filing cabinet, not a record system.
 *
 * The record is created here and the browser goes straight to it, the same
 * shape the mobile flow has: create, then write.
 */

const VISIT_TYPES = [
  { value: "home_call", label: "Home call" },
  { value: "field_visit", label: "Farm or field visit" },
  { value: "clinic_visit", label: "Clinic visit" },
  { value: "follow_up", label: "Follow-up" },
  { value: "emergency", label: "Emergency" },
  { value: "teleconsult", label: "Teleconsult" }
];

export function NewRecordForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const recordId = crypto.randomUUID();

    const { error: rpcError } = await supabase.rpc(
      "create_visit",
      definedArgs({
        p_id: recordId,
        p_patient_id: patientId,
        p_visit_date: new Date().toISOString(),
        p_visit_type: String(form.get("visitType") ?? "home_call"),
        p_chief_complaint: optionalText(form.get("chiefComplaint")),
        // Minted here so the record carries the reference the client will be
        // given from the moment it exists, exactly as on the phone.
        p_record_code: generateVisitRecordCode()
      })
    );

    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }

    router.push(`/practice/visits/${recordId}`);
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="grid">
        <label>
          Kind of visit
          <select name="visitType" defaultValue="home_call">
            {VISIT_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Why you were called (optional)
          <input name="chiefComplaint" maxLength={2000} placeholder="Off feed since yesterday" />
        </label>
      </div>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={busy}>
        {busy ? "Starting…" : "Start a record"}
      </button>
    </form>
  );
}
