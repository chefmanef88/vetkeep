import type { ConflictPolicy, EntityType } from "./types";

/**
 * The conflict policy for each syncable record type, from brief section 15.6.
 *
 * The table is exhaustive by construction: EntityType is a closed union, so
 * adding a syncable table without deciding how its conflicts resolve will not
 * compile. That is deliberate. The failure mode this guards against is a new
 * clinical field quietly inheriting last-write-wins and losing a vet's note.
 */
const POLICIES: Record<EntityType, ConflictPolicy> = {
  // A completed visit is a signed medical record. It is never merged and never
  // overwritten; a correction is an amendment appended alongside the original.
  visit: "reject_immutable",
  visit_amendment: "reject_immutable",

  // Draft prose is compared section by section and shown to the vet. Two
  // devices writing different assessments of the same animal is a clinical
  // question, not something software should resolve on timestamps.
  visit_draft: "manual_section",

  // Each of the eleven systems is its own decision, so a conflict is scoped to
  // the system that actually differs rather than the whole examination.
  exam_finding: "manual_per_system",

  // Identity and contact details: show both and let the vet choose. A silently
  // reverted phone number means a client who cannot be reached.
  client: "manual_compare",
  patient: "manual_compare",
  patient_owner: "manual_compare",

  // Side effects with money or a clinical consequence attached. Idempotency
  // keys make a replay a no-op; merging two versions would double-count a dose
  // or a payment.
  treatment: "idempotent_never_merge",
  preventive_care: "idempotent_never_merge",
  invoice: "idempotent_never_merge",
  invoice_payment: "idempotent_never_merge",

  // Consent is immutable in the database from the moment it is given: the
  // substance cannot be edited, only withdrawn, because the one party with an
  // interest in rewriting what was agreed is the one holding the pen. A
  // conflicting edit has nothing to merge and nothing to ask about.
  consent: "reject_immutable",

  // There is one death per animal and a unique index that enforces it. A
  // conflict here means the record already exists, almost always sent from the
  // vet's other device, and the local copy must be dropped rather than become a
  // second death for the same animal.
  euthanasia_record: "reject_immutable",

  // Not immutable, and that is the point. update_surgical_procedure takes a
  // base_server_version and the server rejects a stale one, so a conflict means
  // the vet typed anaesthetic doses and an outcome against a version someone
  // else had already moved on from. Discarding that silently is the exact
  // failure the comment at the top of this file is about, and merging two sets
  // of doses would be worse. So it goes to the vet, with both versions shown.
  surgical_procedure: "manual_compare",

  display_preference: "last_write_wins"
};

export function conflictPolicyFor(entityType: EntityType): ConflictPolicy {
  return POLICIES[entityType];
}

/** True when the vet has to look at the conflict before it can be resolved. */
export function requiresManualResolution(policy: ConflictPolicy): boolean {
  return (
    policy === "manual_section" || policy === "manual_per_system" || policy === "manual_compare"
  );
}

/**
 * True when the local mutation should be discarded outright rather than
 * queued for the vet to resolve.
 */
export function discardsLocalChange(policy: ConflictPolicy): boolean {
  // A replayed idempotent mutation already took effect on the server, so there
  // is nothing to resolve. An immutable record rejects the edit and the vet is
  // directed to amend instead.
  return policy === "idempotent_never_merge" || policy === "reject_immutable";
}

export const ALL_ENTITY_TYPES = Object.keys(POLICIES) as EntityType[];
