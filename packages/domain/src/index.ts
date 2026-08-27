export {
  CLIENT_CODE_PATTERN,
  CLIENT_CODE_PREFIX,
  CODE_TAKEN,
  CODE_TAKEN_MESSAGE,
  PATIENT_CODE_PATTERN,
  PATIENT_CODE_PREFIX,
  RECORD_CODE_PATTERN,
  RECORD_CODE_PREFIX,
  callWithFreshCode,
  generateClientCode,
  generatePatientCode,
  generateVisitRecordCode,
  isCodeCollision,
  normalizeRecordCode
} from "./codes";

export { describeAge, describeGroupAge, type DateOfBirthPrecision } from "./age";

export { EXAM_SYSTEM_ORDER, examSystemRank, sortByExamOrder, type ExamSystem } from "./exam";

export {
  CONCENTRATION_SOURCES,
  CONCENTRATION_UNITS,
  DOSE_RATE_UNITS,
  calculateDose,
  concentrationLabel,
  doseRateLabel,
  strengthWarning,
  toKilograms,
  toMgPerMl,
  type Concentration,
  type ConcentrationSource,
  type ConcentrationUnit,
  type DoseRateUnit,
  type DoseResult
} from "./dose";

export {
  TREATMENT_ROUTES,
  defaultTreatmentRoute,
  treatmentRouteLabel,
  treatmentRoutesFor,
  type TreatmentRoute
} from "./treatment";

export {
  PARASITE_TARGETS,
  PREVENTIVE_KINDS,
  PREVENTIVE_ROUTES,
  VACCINE_PROFILES,
  VACCINE_TYPES,
  defaultRouteFor,
  dueState,
  parasiteLabel,
  preventiveKindLabel,
  routeLabel,
  routesFor,
  suggestedNextDue,
  vaccineLabel,
  vaccinesForSpecies,
  type ParasiteTarget,
  type PreventiveKind,
  type PreventiveRoute,
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
