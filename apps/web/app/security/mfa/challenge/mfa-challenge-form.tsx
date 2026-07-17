"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function MfaChallengeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((candidate) => candidate.status === "verified");
    if (factorError || !factor) {
      setBusy(false);
      setError(factorError?.message ?? "No verified authenticator factor was found.");
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code
    });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="stack">
      <label>
        Six-digit code
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
        />
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" disabled={busy || code.length !== 6} onClick={() => void verify()}>
        {busy ? "Verifying…" : "Continue"}
      </button>
    </div>
  );
}
