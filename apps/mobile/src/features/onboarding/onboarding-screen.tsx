import { useState } from "react";
import { vetOnboardingSchema } from "@vetkeep/validation";
import { useSession } from "@/auth/session-provider";
import { registerCurrentDevice } from "@/device/device-registry";
import { buildMobileOnboardingRpcArgs } from "@/features/onboarding/onboarding-rpc";
import { supabase } from "@/lib/supabase";
import { Body, ErrorText, Field, PrimaryButton, Screen, Title } from "@/ui/components";

export function OnboardingScreen() {
  const { refreshProfile } = useSession();
  const [fullName, setFullName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = vetOnboardingSchema.safeParse({
      fullName,
      licenseNumber: licenseNumber || null,
      phoneDisplay,
      phoneE164,
      businessName: businessName || null,
      serviceAreas: []
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form values.");
      return;
    }

    setBusy(true);
    setError(null);
    const { error: onboardingError } = await supabase.rpc(
      "complete_vet_onboarding",
      buildMobileOnboardingRpcArgs(parsed.data)
    );

    if (onboardingError) {
      setBusy(false);
      setError(onboardingError.message);
      return;
    }

    try {
      await registerCurrentDevice();
      await refreshProfile();
    } catch (deviceError) {
      setError(deviceError instanceof Error ? deviceError.message : "Device registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Complete onboarding</Title>
      <Body>
        Your licence will remain pending until VetKeep completes professional verification.
      </Body>
      <Field value={fullName} onChangeText={setFullName} placeholder="Full name" />
      <Field
        value={licenseNumber}
        onChangeText={setLicenseNumber}
        placeholder="Veterinary Council licence number"
      />
      <Field
        value={phoneDisplay}
        onChangeText={setPhoneDisplay}
        keyboardType="phone-pad"
        placeholder="Phone as displayed"
      />
      <Field
        value={phoneE164}
        onChangeText={setPhoneE164}
        keyboardType="phone-pad"
        placeholder="+233241234567"
      />
      <Field
        value={businessName}
        onChangeText={setBusinessName}
        placeholder="Business name (optional)"
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <PrimaryButton
        label={busy ? "Saving…" : "Complete onboarding"}
        disabled={busy}
        onPress={() => void submit()}
      />
    </Screen>
  );
}
