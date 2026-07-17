import { describe, expect, it } from "vitest";
import { deviceRegistrationSchema, vetOnboardingSchema } from "./index";

describe("VetKeep validation", () => {
  it("accepts a normalized Ghana number", () => {
    const result = vetOnboardingSchema.safeParse({
      fullName: "Dr Roland Armah",
      phoneDisplay: "024 123 4567",
      phoneE164: "+233241234567",
      serviceAreas: ["Accra"]
    });
    expect(result.success).toBe(true);
  });

  it("rejects a local number in the normalized field", () => {
    const result = vetOnboardingSchema.safeParse({
      fullName: "Dr Roland Armah",
      phoneDisplay: "024 123 4567",
      phoneE164: "0241234567"
    });
    expect(result.success).toBe(false);
  });

  it("requires a real UUID for device registration", () => {
    expect(
      deviceRegistrationSchema.safeParse({
        deviceId: "phone-1",
        deviceName: "iPhone",
        platform: "ios"
      }).success
    ).toBe(false);
  });
});
