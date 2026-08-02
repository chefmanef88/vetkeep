"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { readableError } from "@/lib/practice/format";
import { definedArgs, optionalText } from "@/lib/practice/rpc-args";

const TYPES = [
  { value: "home_call", label: "House call" },
  { value: "follow_up", label: "Follow-up" },
  { value: "emergency", label: "Emergency" },
  { value: "field_visit", label: "Field visit" }
];

export function NewAppointmentForm({
  clientId,
  patients,
  defaultAddress
}: {
  clientId: string;
  patients: { id: string; name: string }[];
  defaultAddress: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const start = String(form.get("start") ?? "");

    // A house call is booked as a one-hour slot unless the vet later moves it.
    const startedAt = start ? new Date(start) : null;

    const { error: rpcError } = await supabase.rpc(
      "create_appointment",
      definedArgs({
        p_id: crypto.randomUUID(),
        p_appointment_type: String(form.get("type") ?? "home_call"),
        p_client_id: clientId,
        p_patient_id: String(form.get("patientId") ?? ""),
        p_scheduled_start: startedAt?.toISOString(),
        p_scheduled_end: startedAt
          ? new Date(startedAt.getTime() + 60 * 60 * 1000).toISOString()
          : undefined,
        p_reason_for_visit: optionalText(form.get("reason")),
        p_visit_address: optionalText(form.get("address"))
      })
    );

    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }

    router.push("/practice/appointments");
    router.refresh();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <p className="muted">
        Requests start unconfirmed. Confirm one once you have agreed the time with the client.
      </p>
      <div className="grid">
        <label>
          Animal
          <select name="patientId" required>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select name="type" defaultValue="home_call">
            {TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Requested time
        <input type="datetime-local" name="start" required />
      </label>
      <label>
        Visit address
        <input name="address" defaultValue={defaultAddress} maxLength={500} />
      </label>
      <label>
        Reason
        <input name="reason" maxLength={1000} placeholder="Not eating since yesterday" />
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy}>
        {busy ? "Requesting…" : "Request house call"}
      </button>
    </form>
  );
}
