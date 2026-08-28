"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Mode = "signin" | "signup" | "recover";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function go(next: Mode) {
    setMode(next);
    setError(null);
    setMessage(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const supabase = createClient();

    if (mode === "recover") {
      const { error: sendError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm`
      });
      setBusy(false);
      if (sendError) {
        setError(sendError.message);
        return;
      }
      // Same words whether or not the address is registered: naming which
      // addresses have accounts would hand a list to anyone who asked.
      setMessage("If that address has an account, the link is on its way.");
      return;
    }

    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/confirm`
            }
          });

    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }

    if (mode === "signup") {
      setMessage("Check your email to confirm the account, then sign in to complete onboarding.");
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label>
        Email
        <input type="email" name="email" autoComplete="email" required maxLength={254} />
      </label>
      {mode === "recover" ? null : (
        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={12}
          />
        </label>
      )}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      <button type="submit" disabled={busy}>
        {busy
          ? "Working…"
          : mode === "signin"
            ? "Sign in"
            : mode === "signup"
              ? "Create account"
              : "Send the link"}
      </button>

      {mode === "signin" ? (
        <button type="button" className="secondary" onClick={() => go("recover")}>
          Forgot your password?
        </button>
      ) : null}

      <button
        type="button"
        className="secondary"
        onClick={() => go(mode === "signin" ? "signup" : "signin")}
      >
        {mode === "signin"
          ? "Create a veterinarian account"
          : mode === "signup"
            ? "I already have an account"
            : "Back to sign in"}
      </button>
    </form>
  );
}
