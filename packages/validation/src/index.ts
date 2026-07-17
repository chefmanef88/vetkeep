import { z } from "zod";

const ghanaPhone = /^\+233\d{9}$/;

export const vetOnboardingSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  licenseNumber: z.string().trim().min(2).max(80).nullable().optional(),
  phoneDisplay: z.string().trim().min(7).max(30),
  phoneE164: z
    .string()
    .trim()
    .regex(ghanaPhone, "Use Ghana E.164 format, for example +233241234567"),
  whatsappDisplay: z.string().trim().max(30).nullable().optional(),
  whatsappE164: z.string().trim().regex(ghanaPhone).nullable().optional(),
  businessName: z.string().trim().max(160).nullable().optional(),
  serviceAreas: z.array(z.string().trim().min(2).max(80)).max(20).default([])
});

export const deviceRegistrationSchema = z.object({
  deviceId: z.string().uuid(),
  deviceName: z.string().trim().min(1).max(120),
  platform: z.enum(["ios", "android"]),
  appVersion: z.string().trim().max(40).nullable().optional()
});

export type VetOnboardingInput = z.infer<typeof vetOnboardingSchema>;
export type DeviceRegistrationInput = z.infer<typeof deviceRegistrationSchema>;
