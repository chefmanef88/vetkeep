import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Body,
  ErrorText,
  Field,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Title
} from "@/ui/components";

export function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (result.error) setError(result.error.message);
    else if (mode === "signup") setMessage("Confirm the account from your email, then sign in.");
  }

  return (
    <Screen>
      <Title>VetKeep</Title>
      <Body>
        Secure access for verified veterinary professionals. Shared accounts are not permitted.
      </Body>
      <Field
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="Email"
      />
      <Field
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        placeholder="Password (12+ characters)"
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {message ? <Body>{message}</Body> : null}
      <PrimaryButton
        label={busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
        disabled={busy || password.length < 12 || !email.includes("@")}
        onPress={() => void submit()}
      />
      <SecondaryButton
        label={mode === "signin" ? "Create veterinarian account" : "I already have an account"}
        onPress={() => setMode(mode === "signin" ? "signup" : "signin")}
      />
    </Screen>
  );
}
