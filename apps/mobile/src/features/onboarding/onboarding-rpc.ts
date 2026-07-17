import type { Database } from "@vetkeep/database/types";
import type { VetOnboardingInput } from "@vetkeep/validation";

type CompleteVetOnboardingArgs = Database["public"]["Functions"]["complete_vet_onboarding"]["Args"];

export function buildMobileOnboardingRpcArgs(input: VetOnboardingInput): CompleteVetOnboardingArgs {
  return {
    p_full_name: input.fullName,
    p_phone_display: input.phoneDisplay,
    p_phone_e164: input.phoneE164,
    p_service_areas: input.serviceAreas ?? [],
    ...(input.licenseNumber ? { p_license_number: input.licenseNumber } : {}),
    ...(input.whatsappDisplay ? { p_whatsapp_display: input.whatsappDisplay } : {}),
    ...(input.whatsappE164 ? { p_whatsapp_e164: input.whatsappE164 } : {}),
    ...(input.businessName ? { p_business_name: input.businessName } : {})
  };
}
