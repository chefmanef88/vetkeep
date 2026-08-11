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
