/**
 * Types for the offline mutation queue, per brief section 15.
 *
 * Nothing here knows what the local database is. Choosing between RxDB and
 * WatermelonDB is a Phase 0 gate that needs the two-device proof of concept in
 * section 15.2, so the engine talks to a storage adapter instead and the
 * decision stays open.
 */

export type MutationOperation = "create" | "update" | "delete";

/**
 * A queued write, held on the device until the server accepts it.
 *
 * `mutationId` is the idempotency key and is generated on the device when the
 * vet performs the action, not when the sync runs. Retrying a mutation must
 * never create a second record or deduct stock twice, and the server's create
 * RPCs are idempotent on this id.
 */
export interface OutboundMutation {
  mutationId: string;
  entityType: EntityType;
  entityId: string;
  operation: MutationOperation;
  /** The controlled RPC that performs this write. */
  rpcName: string;
  payload: Record<string, unknown>;
  /**
   * The `server_version` the device believed it was editing. Null for creates,
   * which have nothing to be stale against.
   */
  baseServerVersion: number | null;
  createdAt: string;
  attemptCount: number;
  lastError: string | null;
}

export interface SyncCheckpoint {
  collectionName: string;
  lastServerCursor: string | null;
  lastSuccessfulSyncAt: string | null;
}

/**
 * Entity types the queue can carry. Kept as a closed union so a new syncable
 * table cannot be added without also deciding its conflict policy below.
 */
export type EntityType =
  | "client"
  | "patient"
  | "patient_owner"
  | "visit"
  | "visit_draft"
  | "exam_finding"
  | "visit_amendment"
  | "treatment"
  | "preventive_care"
  | "invoice"
  | "invoice_payment"
  | "display_preference";

/**
 * How a conflict on a given record type must be handled. Taken from the table
 * in brief section 15.6. The rule that matters most: medical prose is never
 * silently merged and never last-write-wins.
 */
export type ConflictPolicy =
  | "reject_immutable"
  | "manual_section"
  | "manual_per_system"
  | "manual_compare"
  | "validate_transition"
  | "idempotent_never_merge"
  | "last_write_wins";

export type SyncOutcome =
  | { kind: "accepted"; serverVersion: number }
  | { kind: "conflict"; policy: ConflictPolicy; serverVersion: number; reason: string }
  | { kind: "retry"; afterMs: number; reason: string }
  | { kind: "dead_letter"; reason: string };

/** What the server said when a mutation was pushed. */
export type PushResponse =
  | { status: "accepted"; serverVersion: number }
  | { status: "stale"; serverVersion: number; message: string }
  | { status: "rejected"; code: string; message: string }
  | { status: "unavailable"; message: string };

/**
 * Storage the engine needs from whichever local database wins the Phase 0
 * evaluation. Deliberately narrow: anything richer would leak that database's
 * query model into the engine and make the choice harder to reverse.
 */
export interface SyncStorage {
  enqueue(mutation: OutboundMutation): Promise<void>;
  /** Oldest-first, bounded. Sync is never an unbounded full-table push. */
  claimBatch(limit: number): Promise<OutboundMutation[]>;
  remove(mutationId: string): Promise<void>;
  update(mutation: OutboundMutation): Promise<void>;
  moveToDeadLetter(mutation: OutboundMutation, reason: string): Promise<void>;
  readCheckpoint(collectionName: string): Promise<SyncCheckpoint | null>;
  writeCheckpoint(checkpoint: SyncCheckpoint): Promise<void>;
}
