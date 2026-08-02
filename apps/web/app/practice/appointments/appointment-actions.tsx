"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { readableError } from "@/lib/practice/format";

export function AppointmentActions({
  appointmentId,
  status,
  visitId,
  appointmentType
}: {
  appointmentId: string;
  status: string;
  visitId: string | null;
  appointmentType: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // The expected status is sent so a stale tab cannot push a transition that
    // has already happened on another device.
    const { error: rpcError } = await supabase.rpc("transition_appointment_status", {
      p_id: appointmentId,
      p_to_status: "confirmed",
      p_expected_status: status
    });
    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }
    router.refresh();
  }

  async function startVisit() {
    setBusy(true);
    setError(null);
    const supabase = createClient();

    const { data: appointment, error: loadError } = await supabase
      .from("appointments")
      .select("patient_id")
      .eq("id", appointmentId)
      .maybeSingle();

    if (loadError || !appointment?.patient_id) {
      setBusy(false);
      setError("This appointment has no animal attached, so a visit cannot be opened.");
      return;
    }

    const newVisitId = crypto.randomUUID();
    const visitType = appointmentType === "clinic_visit" ? "clinic_visit" : appointmentType;

    const { error: visitError } = await supabase.rpc("create_visit", {
      p_id: newVisitId,
      p_patient_id: appointment.patient_id,
      p_visit_date: new Date().toISOString(),
      p_visit_type: visitType,
      p_appointment_id: appointmentId
    });

    setBusy(false);
    if (visitError) {
      setError(readableError(visitError.message));
      return;
    }

    router.push(`/practice/visits/${newVisitId}`);
  }

  return (
    <div className="actions">
      {status === "requested" || status === "rescheduled" ? (
        <button type="button" onClick={confirm} disabled={busy}>
          {busy ? "Working…" : "Confirm"}
        </button>
      ) : null}

      {status === "confirmed" && !visitId ? (
        <button type="button" onClick={startVisit} disabled={busy}>
          {busy ? "Opening…" : "Arrive and start visit"}
        </button>
      ) : null}

      {visitId ? (
        <a className="button secondary" href={`/practice/visits/${visitId}`}>
          Open visit
        </a>
      ) : null}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
