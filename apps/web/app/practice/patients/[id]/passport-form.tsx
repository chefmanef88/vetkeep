"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { readableError } from "@/lib/practice/format";
import { definedArgs, optionalText } from "@/lib/practice/rpc-args";

/**
 * Publishing an animal's passport, from the web application (brief §10).
 *
 * The same feature exists on mobile, and this is not duplication for its own
 * sake. The token is minted in the browser and only its hash reaches the
 * server, so whichever device creates a passport is the one that can show the
 * link — a passport enabled on a phone cannot be re-displayed here, and the
 * other way round. Both surfaces need it for the feature to be usable at all.
 *
 * It also means a veterinarian without their phone to hand is not locked out of
 * the one part of the product a third party ever sees.
 */

const VISIBILITY = [
  { value: "hidden", label: "Hidden" },
  { value: "first_name", label: "First name only" },
  { value: "full_name", label: "Full name" }
];

/**
 * Thirty-two URL-safe characters from the browser's cryptographic source —
 * around 190 bits. Matches the mobile generator exactly; a token minted in
 * either place must be indistinguishable to the server.
 */
function generatePassportToken(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let token = "";
  for (const byte of bytes) token += alphabet[byte % alphabet.length];
  return token;
}

export type PassportState = {
  enabled: boolean;
  ownerNameVisibility: string;
  showMicrochip: boolean;
} | null;

export function PassportForm({
  patientId,
  patientName,
  passport,
  views
}: {
  patientId: string;
  patientName: string;
  passport: PassportState;
  views: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const live = passport?.enabled === true;
  const origin = process.env["NEXT_PUBLIC_APP_URL"] ?? "";

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    if (form.get("consent") !== "on") {
      setBusy(false);
      setError("Record the owner's consent before publishing.");
      return;
    }

    const supabase = createClient();
    const token = generatePassportToken();

    const { error: rpcError } = await supabase.rpc(
      "enable_patient_passport",
      definedArgs({
        p_id: crypto.randomUUID(),
        p_patient_id: patientId,
        p_token: token,
        p_consent_confirmed: true,
        p_owner_name_visibility: String(form.get("visibility") ?? "hidden"),
        p_show_microchip: form.get("microchip") === "on",
        p_consent_notes: optionalText(form.get("consentNotes"))
      })
    );

    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }

    // Shown once, here. The server kept only a hash, so this is the only moment
    // the link exists anywhere but in the reader's hands.
    setLink(`${origin}/passport/${token}`);
    setNotice("Passport published.");
    router.refresh();
  }

  async function rotate() {
    setBusy(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const token = generatePassportToken();
    const { error: rpcError } = await supabase.rpc("rotate_passport_token", {
      p_patient_id: patientId,
      p_token: token
    });

    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }
    setLink(`${origin}/passport/${token}`);
    setNotice("New link issued. Every code printed before now is dead.");
    router.refresh();
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("revoke_patient_passport", {
      p_patient_id: patientId
    });

    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }
    setLink(null);
    setNotice("Passport withdrawn. The link no longer answers.");
    router.refresh();
  }

  return (
    <div className="stack">
      <p className="muted">
        A link a groomer or boarding kennel can open to check {patientName} is vaccinated. It shows
        identity and vaccination status — never notes, examination, treatment or prescriptions.
      </p>

      {live ? (
        <p>
          <span className="pill pill-completed">Published</span>{" "}
          <span className="muted">
            opened {views} {views === 1 ? "time" : "times"}
          </span>
        </p>
      ) : (
        <p className="muted">Not published.</p>
      )}

      {link ? (
        <div className="stack">
          <p className="code-line">
            <span className="code">{link}</span>
          </p>
          <p className="muted">
            Copy this now. Only the hash is stored, so this link cannot be shown again — if it is
            lost, issue a new one.
          </p>
        </div>
      ) : live ? (
        <p className="muted">
          This passport was published from another device, which holds the link. Issue a new one
          below to get a link you can share here; the old one stops working.
        </p>
      ) : null}

      <form className="stack" onSubmit={publish}>
        <div className="grid">
          <label>
            Show the owner&rsquo;s name as
            <select name="visibility" defaultValue={passport?.ownerNameVisibility ?? "hidden"}>
              {VISIBILITY.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            How consent was given (optional)
            <input
              name="consentNotes"
              maxLength={1000}
              placeholder="Agreed in person at the farm"
            />
          </label>
        </div>

        <label>
          <input
            type="checkbox"
            name="microchip"
            defaultChecked={passport?.showMicrochip ?? false}
          />{" "}
          Show the microchip number. This is how a stolen animal is traced — leave it off unless the
          owner asked for it.
        </label>

        <label>
          <input type="checkbox" name="consent" /> The owner agreed to this animal&rsquo;s details
          being published at a public link.
        </label>

        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? <p className="muted">{notice}</p> : null}

        <button type="submit" disabled={busy}>
          {busy ? "Working…" : live ? "Update the passport" : "Publish the passport"}
        </button>
      </form>

      {live ? (
        <div className="stack">
          <p className="muted">
            Issuing a new link keeps the passport but kills every code already printed, stuck to a
            kennel door, or saved by an owner. Withdrawing takes the page down immediately.
          </p>
          <div className="grid">
            <button type="button" disabled={busy} onClick={() => void rotate()}>
              Issue a new link
            </button>
            <button type="button" disabled={busy} onClick={() => void revoke()}>
              Withdraw the passport
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
