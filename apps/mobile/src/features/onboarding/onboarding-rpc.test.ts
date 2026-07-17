import { describe, expect, it } from "vitest";
import { buildMobileOnboardingRpcArgs } from "./onboarding-rpc";

describe("buildMobileOnboardingRpcArgs", () => {
  it("does not send absent optional values", () => {
    const args = buildMobileOnboardingRpcArgs({
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
    expect(Object.values(args)).not.toContain(undefined);
  });

  it("includes optional values when provided", () => {
    const args = buildMobileOnboardingRpcArgs({
      fullName: "Dr Roland Armah",
      licenseNumber: "VCG-1234",
      phoneDisplay: "024 123 4567",
      phoneE164: "+233241234567",
      businessName: "VetKeep Mobile Practice",
      serviceAreas: ["Accra"]
    });

    expect(args.p_license_number).toBe("VCG-1234");
    expect(args.p_business_name).toBe("VetKeep Mobile Practice");
  });
});
