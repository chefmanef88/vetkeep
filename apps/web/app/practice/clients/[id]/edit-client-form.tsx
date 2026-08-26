"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { readableError } from "@/lib/practice/format";
import { definedArgs, optionalText } from "@/lib/practice/rpc-args";

/**
 * Correcting a client's details.
 *
 * update_client existed from Phase 2 and was never wired to anything, so a
 * mistyped phone number could be created and never fixed. That is worse than a
 * missing feature: the number a veterinarian rings is the one thing on a client
 * record that has to be right, and a client who cannot be reached is a visit
 * that does not happen.
 *
 * Standing information stays editable for the life of the folder (brief §6).
 * It is only the consultation record that is frozen once signed.
 */

export function EditClientForm({
  client
}: {
  client: {
    id: string;
    name: string;
    phone_display: string;
    phone_e164: string;
    whatsapp_display: string | null;
    whatsapp_e164: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    communication_consent: boolean;
    server_version: number;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const supabase = createClient();

    const { error: rpcError } = await supabase.rpc(
      "update_client",
      definedArgs({
        p_id: client.id,
        p_name: String(form.get("name") ?? ""),
        p_phone_display: String(form.get("phoneDisplay") ?? ""),
        p_phone_e164: String(form.get("phoneE164") ?? ""),
        p_whatsapp_display: optionalText(form.get("whatsappDisplay")),
        p_whatsapp_e164: optionalText(form.get("whatsappE164")),
        p_email: optionalText(form.get("email")),
        p_address: optionalText(form.get("address")),
        p_notes: optionalText(form.get("notes")),
        p_communication_consent: form.get("consent") === "on",
        // The version this form was built from. A stale write is refused rather
        // than applied over someone else's correction.
        p_base_server_version: client.server_version
      })
    );

    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}>
        Edit these details
      </button>
    );
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="grid">
        <label>
          Name
          <input name="name" required maxLength={160} defaultValue={client.name} />
        </label>
        <label>
          Phone
          <input name="phoneDisplay" required maxLength={30} defaultValue={client.phone_display} />
        </label>
      </div>

      <div className="grid">
        <label>
          Phone in full international form
          <input name="phoneE164" required defaultValue={client.phone_e164} placeholder="+233…" />
        </label>
        <label>
          Email
          <input name="email" type="email" defaultValue={client.email ?? ""} />
        </label>
      </div>

      <div className="grid">
        <label>
          WhatsApp
          <input name="whatsappDisplay" defaultValue={client.whatsapp_display ?? ""} />
        </label>
        <label>
          WhatsApp in full international form
          <input
            name="whatsappE164"
            defaultValue={client.whatsapp_e164 ?? ""}
            placeholder="+233…"
          />
        </label>
      </div>

      <label>
        Address
        <input name="address" maxLength={500} defaultValue={client.address ?? ""} />
      </label>

      <label>
        Notes
        <input name="notes" maxLength={2000} defaultValue={client.notes ?? ""} />
      </label>

      <label>
        <input type="checkbox" name="consent" defaultChecked={client.communication_consent} /> This
        client agreed to receive follow-up and vaccination reminders.
      </label>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid">
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
