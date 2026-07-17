"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import {
  clearPreparedMfaEnrollment,
  prepareMfaEnrollment,
  type MfaEnrollment
} from "@/lib/mfa-enrollment";

export function MfaEnrollForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    void prepareMfaEnrollment(userId, {
      listFactors: () => supabase.auth.mfa.listFactors(),
      unenroll: (factorId) => supabase.auth.mfa.unenroll({ factorId }),
      enrollTotp: () =>
        supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "VetKeep authenticator"
        })
    })
      .then((result) => {
        if (!active) return;
        setEnrollment(result);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Unable to prepare MFA enrollment.");
      });

    return () => {
      active = false;
    };
  }, [userId]);

  async function verify() {
    if (!enrollment || code.length !== 6) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({
      factorId: enrollment.factorId,
      code
    });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    clearPreparedMfaEnrollment(userId);
    router.replace("/onboarding");
    router.refresh();
  }

  if (!enrollment && !error) return <p role="status">Preparing secure enrollment…</p>;

  return (
    <div className="stack">
      {enrollment ? (
        <>
          {/* Supabase returns an enrollment-only data URI. Never persist it or send it to logs. */}
          <img
            src={enrollment.qrCode}
            alt="Authenticator enrollment QR code"
            width={240}
            height={240}
          />
          <details>
            <summary>Cannot scan the QR code?</summary>
            <p>Enter this one-time secret manually in your authenticator app:</p>
            <code>{enrollment.secret}</code>
            <p className="muted">Enrollment URI: {enrollment.uri}</p>
          </details>
          <label>
            Six-digit code
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </label>
          <button type="button" disabled={busy || code.length !== 6} onClick={() => void verify()}>
            {busy ? "Verifying…" : "Verify and enable MFA"}
          </button>
        </>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
