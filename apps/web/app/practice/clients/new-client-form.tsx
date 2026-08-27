"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { callWithFreshCode, generateClientCode } from "@vetkeep/domain";
import { createClient } from "@/lib/supabase/browser";
import { readableError } from "@/lib/practice/format";
import { definedArgs, optionalText } from "@/lib/practice/rpc-args";

export function NewClientForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const supabase = createClient();

    // The id and the code are both minted here rather than by the server, so the
    // same call works unchanged from a phone with no signal. Retrying it is safe.
    // The code is re-minted if it is already taken, which nobody has yet seen.
    const clientId = crypto.randomUUID();
    const { error: rpcError } = await callWithFreshCode(generateClientCode, (code) =>
      supabase.rpc(
        "create_client",
        definedArgs({
          p_id: clientId,
          p_client_code: code,
          p_name: String(form.get("name") ?? ""),
          p_phone_display: String(form.get("phoneDisplay") ?? ""),
          p_phone_e164: String(form.get("phoneE164") ?? ""),
          p_address: optionalText(form.get("address")),
          p_communication_consent: form.get("consent") === "on"
        })
      )
    );

    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }

    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label>
        Name
        <input name="name" required maxLength={160} />
      </label>
      <div className="grid">
        <label>
          Phone as displayed
          <input name="phoneDisplay" required placeholder="024 123 4567" />
        </label>
        <label>
          Phone in E.164
          <input name="phoneE164" required placeholder="+233241234567" />
        </label>
      </div>
      <label>
        Address or landmark
        <input name="address" maxLength={500} placeholder="Behind the school, Adenta" />
      </label>
      <label className="checkbox">
        <input type="checkbox" name="consent" />
        This client agreed to receive follow-up and vaccination reminders
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Add client"}
      </button>
    </form>
  );
}
