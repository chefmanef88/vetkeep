import { useEffect, useState } from "react";
import { Text } from "react-native";
import { useSession } from "@/auth/session-provider";
import { supabase } from "@/lib/supabase";
import { Body, ErrorText, Field, PrimaryButton, Screen, Title } from "@/ui/components";

export function MfaEnrollScreen() {
  const { refreshMfaState } = useSession();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const unverified =
        factors?.all.filter(
          (factor) => factor.factor_type === "totp" && factor.status === "unverified"
        ) ?? [];
      await Promise.all(
        unverified.map((factor) => supabase.auth.mfa.unenroll({ factorId: factor.id }))
      );
      const result = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "VetKeep mobile"
      });
      if (!active) return;
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setFactorId(result.data.id);
      setSecret(result.data.totp.secret);
      setUri(result.data.totp.uri);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function verify() {
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    await refreshMfaState();
  }

  return (
    <Screen>
      <Title>Enable account protection</Title>
      <Body>
        Add this secret to an authenticator app, then enter its six-digit code. For easier QR
        enrollment, use the VetKeep web portal.
      </Body>
      {secret ? <Text selectable>{secret}</Text> : <Body>Preparing enrollment…</Body>}
      {uri ? <Text selectable>{uri}</Text> : null}
      <Field
        value={code}
        onChangeText={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        placeholder="Six-digit code"
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <PrimaryButton
        label={busy ? "Verifying…" : "Verify and enable MFA"}
        disabled={busy || !factorId || code.length !== 6}
        onPress={() => void verify()}
      />
    </Screen>
  );
}
