"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function RevokeDeviceButton({
  deviceId,
  deviceName
}: {
  deviceId: string;
  deviceName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    const confirmed = window.confirm(
      `Revoke ${deviceName}? VetKeep will also terminate every other session except this web session as a safety precaution.`
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    const supabase = createClient();

    // Supabase does not expose a safe client-side API for revoking one exact
    // refresh token. Terminating all other sessions is intentionally broader
    // than the selected device and is the safer containment action.
    const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
    if (signOutError) {
      setBusy(false);
      setError("Other sessions could not be terminated. The device was not marked as revoked.");
      return;
    }

    const { error: revokeError } = await supabase.rpc("revoke_current_device", {
      p_device_id: deviceId,
      p_reason: "Revoked by veterinarian from the security dashboard"
    });

    setBusy(false);
    if (revokeError) {
      setError(
        "Other sessions were terminated, but the device registry could not be updated. Contact VetKeep support."
      );
      return;
    }

    router.refresh();
  }

  return (
    <div className="inline-action">
      <button type="button" className="danger" disabled={busy} onClick={() => void revoke()}>
        {busy ? "Revoking…" : "Revoke device"}
      </button>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
