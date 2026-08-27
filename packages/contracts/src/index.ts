import type { AccountStatus, DevicePlatform } from "@vetkeep/domain";

export {
  definedArgs,
  formatPesewas,
  optionalNumber,
  optionalText,
  parseCedisToPesewas
} from "./rpc-args";

export interface VetProfile {
  id: string;
  authUserId: string;
  fullName: string;
  licenseNumber: string | null;
  licenseVerified: boolean;
  // Null once the account is closed: closure clears contact and keeps only what
  // makes a signed record attributable — the name and the licence number.
  phoneDisplay: string | null;
  phoneE164: string | null;
  businessName: string | null;
  accountStatus: AccountStatus;
}

export interface RegisteredDevice {
  id: string;
  vetId: string;
  deviceName: string;
  platform: DevicePlatform;
  appVersion: string | null;
  lastAuthenticatedAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

export interface AuditEvent {
  id: string;
  vetId: string | null;
  actorAuthUserId: string | null;
  actorVetId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
}
