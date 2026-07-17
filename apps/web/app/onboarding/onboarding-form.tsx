"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { vetOnboardingSchema } from "@vetkeep/validation";
import { buildOnboardingRpcArgs } from "@/lib/onboarding-rpc";
import { createClient } from "@/lib/supabase/browser";

export function OnboardingForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const parsed = vetOnboardingSchema.safeParse({
      fullName: form.get("fullName"),
      licenseNumber: form.get("licenseNumber") || null,
      phoneDisplay: form.get("phoneDisplay"),
      phoneE164: form.get("phoneE164"),
      whatsappDisplay: form.get("whatsappDisplay") || null,
      whatsappE164: form.get("whatsappE164") || null,
      businessName: form.get("businessName") || null,
      serviceAreas: String(form.get("serviceAreas") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    });

    if (!parsed.success) {
      setBusy(false);
      setError(parsed.error.issues[0]?.message ?? "Check the form values.");
      return;
    }

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc(
      "complete_vet_onboarding",
      buildOnboardingRpcArgs(parsed.data)
    );

    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form className="stack" onSubmit={submit}>
      <label>
        Full name
        <input name="fullName" required minLength={2} maxLength={120} />
      </label>
      <label>
        Veterinary Council licence number
        <input name="licenseNumber" maxLength={80} />
      </label>
      <div className="grid">
        <label>
          Phone as displayed
          <input name="phoneDisplay" required />
        </label>
        <label>
          Phone in E.164
          <input name="phoneE164" required placeholder="+233241234567" />
        </label>
      </div>
      <div className="grid">
        <label>
          WhatsApp as displayed
          <input name="whatsappDisplay" />
        </label>
        <label>
          WhatsApp in E.164
          <input name="whatsappE164" placeholder="+233241234567" />
        </label>
      </div>
      <label>
        Business name
        <input name="businessName" maxLength={160} />
      </label>
      <label>
        Service areas, comma-separated
        <input name="serviceAreas" placeholder="Accra, Tema, Kasoa" />
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Complete onboarding"}
      </button>
    </form>
  );
}
