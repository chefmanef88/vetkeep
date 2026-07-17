import { useState } from "react";
import { useSession } from "@/auth/session-provider";
import { supabase } from "@/lib/supabase";
import { Body, ErrorText, Field, PrimaryButton, Screen, Title } from "@/ui/components";

export function MfaChallengeScreen() {
  const { refreshMfaState } = useSession();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    setError(null);
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
    await refreshMfaState();
  }

  return (
    <Screen>
      <Title>Authenticator verification</Title>
      <Body>Enter the six-digit code from your authenticator app.</Body>
      <Field
        value={code}
        onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        placeholder="Six-digit code"
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <PrimaryButton
        label={busy ? "Verifying…" : "Continue"}
        disabled={busy || code.length !== 6}
        onPress={() => void verify()}
      />
    </Screen>
  );
}
