export {
  CLIENT_CODE_PATTERN,
  CLIENT_CODE_PREFIX,
  PATIENT_CODE_PATTERN,
  PATIENT_CODE_PREFIX,
  generateClientCode,
  generatePatientCode,
  normalizeRecordCode
} from "./codes";

export { EXAM_SYSTEM_ORDER, examSystemRank, sortByExamOrder, type ExamSystem } from "./exam";

export {
  VACCINE_PROFILES,
  VACCINE_TYPES,
  dueState,
  suggestedNextDue,
  vaccineLabel,
  vaccinesForSpecies,
  type VaccineProfile,
  type VaccineType
} from "./preventive";

export {
  PATIENT_KINDS,
  PURPOSES,
  SPECIES,
  SPECIES_PROFILES,
  allowsGroup,
  isSpecies,
  purposeLabel,
  requiredWithdrawals,
  speciesProfile,
  type IdentifierKind,
  type PatientKind,
  type Purpose,
  type Species,
  type SpeciesProfile,
  type WithdrawalKind
} from "./species";

export const ACCOUNT_STATUSES = ["active", "suspended", "closed"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const DEVICE_PLATFORMS = ["ios", "android"] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export const MAX_OFFLINE_AUTH_DAYS = 30;
export const DEFAULT_INACTIVITY_LOCK_MS = 5 * 60 * 1000;

export function canOpenCachedRecordsOffline(input: {
  lastAuthenticatedAt: Date;
  now: Date;
  revokedAt?: Date | null;
}): boolean {
  if (input.revokedAt) return false;
  const maxAgeMs = MAX_OFFLINE_AUTH_DAYS * 24 * 60 * 60 * 1000;
  const ageMs = input.now.getTime() - input.lastAuthenticatedAt.getTime();
  return ageMs >= 0 && ageMs <= maxAgeMs;
}

export function shouldRelock(input: {
  lastActiveAt: Date;
  now: Date;
  timeoutMs?: number;
}): boolean {
  const timeout = input.timeoutMs ?? DEFAULT_INACTIVITY_LOCK_MS;
  return input.now.getTime() - input.lastActiveAt.getTime() >= timeout;
}
