import { describe, expect, it } from "vitest";
import { buildOnboardingRpcArgs } from "./onboarding-rpc";

describe("buildOnboardingRpcArgs", () => {
  it("omits optional fields instead of sending undefined", () => {
    const args = buildOnboardingRpcArgs({
      fullName: "Dr Roland Armah",
      phoneDisplay: "024 123 4567",
      phoneE164: "+233241234567",
      serviceAreas: []
    });

    expect(args).toEqual({
      p_full_name: "Dr Roland Armah",
      p_phone_display: "024 123 4567",
      p_phone_e164: "+233241234567",
      p_service_areas: []
    });
    expect("p_license_number" in args).toBe(false);
    expect("p_business_name" in args).toBe(false);
  });

  it("maps all supplied fields to the RPC contract", () => {
    expect(
      buildOnboardingRpcArgs({
        fullName: "Dr Roland Armah",
        licenseNumber: "VCG-1234",
        phoneDisplay: "024 123 4567",
        phoneE164: "+233241234567",
        whatsappDisplay: "024 123 4567",
        whatsappE164: "+233241234567",
        businessName: "VetKeep Mobile Practice",
        serviceAreas: ["Accra", "Tema"]
      })
    ).toEqual({
      p_full_name: "Dr Roland Armah",
      p_license_number: "VCG-1234",
      p_phone_display: "024 123 4567",
      p_phone_e164: "+233241234567",
      p_whatsapp_display: "024 123 4567",
      p_whatsapp_e164: "+233241234567",
      p_business_name: "VetKeep Mobile Practice",
      p_service_areas: ["Accra", "Tema"]
    });
  });
});
