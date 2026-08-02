"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { readableError } from "@/lib/practice/format";
import { definedArgs, optionalText } from "@/lib/practice/rpc-args";

export function FollowUpForm({ patientId, clientId }: { patientId: string; clientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const start = new Date(String(form.get("start") ?? ""));
    const supabase = createClient();

    const { error: rpcError } = await supabase.rpc(
      "create_appointment",
      definedArgs({
        p_id: crypto.randomUUID(),
        p_appointment_type: "follow_up",
        p_client_id: clientId,
        p_patient_id: patientId,
        p_scheduled_start: start.toISOString(),
        p_scheduled_end: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
        p_reason_for_visit: optionalText(form.get("reason"))
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
      <button type="button" className="secondary" onClick={() => setOpen(true)}>
        Schedule a follow-up
      </button>
    );
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label>
        Follow-up time
        <input type="datetime-local" name="start" required />
      </label>
      <label>
        Reason
        <input name="reason" maxLength={1000} placeholder="Recheck the wound" />
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? "Scheduling…" : "Schedule follow-up"}
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
