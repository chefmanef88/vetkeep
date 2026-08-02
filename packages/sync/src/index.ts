export type {
  ConflictPolicy,
  EntityType,
  MutationOperation,
  OutboundMutation,
  PushResponse,
  SyncCheckpoint,
  SyncOutcome,
  SyncStorage
} from "./types";

export {
  ALL_ENTITY_TYPES,
  conflictPolicyFor,
  discardsLocalChange,
  requiresManualResolution
} from "./conflict";

export { MAX_ATTEMPTS, nextRetryDelayMs, shouldDeadLetter } from "./backoff";

export {
  advanceCheckpoint,
  applyOutcome,
  decideOutcome,
  pushBatch,
  type PushResult
} from "./engine";

export {
  CLIENT_FIELDS,
  EXAM_FINDING_FIELDS,
  PATIENT_FIELDS,
  VISIT_DRAFT_FIELDS,
  buildResolvedPayload,
  diffFields,
  isFullyResolved,
  normaliseValue,
  type FieldConflict,
  type FieldSpec,
  type Resolution
} from "./diff";
