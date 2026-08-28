"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { readableError } from "@/lib/practice/format";

/**
 * The minimum is twelve characters, matching what the sign-up screens enforce.
 * Checked here as well as by the server so the person is told before they
 * submit rather than after.
 */
const MINIMUM = 12;

export function SetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = password.length > 0 && password.length < MINIMUM;
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = password.length >= MINIMUM && confirm === password;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    setBusy(false);
    if (updateError) {
      setError(readableError(updateError.message));
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <div className="stack">
        <p role="status">
          <strong>Your password is set.</strong>
        </p>
        <p className="muted">
          Sign in with it now. On the phone you will be asked for your authentication code as usual
          — changing a password does not change your second factor.
        </p>
        <a href="/login">Go to sign in</a>
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={(event) => void submit(event)}>
      <label>
        New password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
      </label>
      <p className="muted">At least {MINIMUM} characters.</p>

      <label>
        Repeat it
        <input
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          required
        />
      </label>

      {/* Said as it is typed rather than on submit: a password field shows
          nothing back, so a typo is invisible until something refuses it. */}
      {tooShort ? <span className="error">That is shorter than {MINIMUM} characters.</span> : null}
      {mismatch ? <span className="error">These two do not match.</span> : null}
      {error ? (
        <span className="error" role="alert">
          {error}
        </span>
      ) : null}

      <button type="submit" disabled={busy || !ready}>
        {busy ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
