import {
  CODE_TAKEN,
  generateClientCode,
  generatePatientCode,
  generateVisitRecordCode
} from "@vetkeep/domain";
import type { OutboundMutation } from "@vetkeep/sync";

/**
 * The remedy for a queued write whose code was already taken.
 *
 * Creation online re-mints silently — the code has existed for milliseconds and
 * been shown to nobody. A queued write is different: it may have been sitting
 * on the device for days, and the reference may already be written on the copy
 * in the client's hand. So this is offered rather than applied, and the vet is
 * told the reference changed.
 *
 * Only the code moves. The record's id stays, so the entry the vet is looking
 * at on the device remains the same record, and the failed attempt inserted
 * nothing to conflict with.
 */

/** RPC parameters that carry a device-minted code, and what re-mints each. */
const CODE_FIELDS: Record<string, () => string> = {
  p_client_code: generateClientCode,
  p_patient_code: generatePatientCode,
  p_record_code: generateVisitRecordCode
};

/**
 * Whether a dead letter is a repeated code rather than a settled refusal.
 *
 * The engine writes the reason as `${code}: ${message}`, so this reads the code
 * back off the front rather than matching on wording that may be reworded.
 */
export function isCodeTakenReason(reason: string): boolean {
  return reason.startsWith(`${CODE_TAKEN}:`);
}

/**
 * Returns the payload with a newly minted code, or null when the mutation
 * carries no code field — in which case there is nothing here to remedy and the
 * caller should leave the dead letter alone.
 */
export function payloadWithFreshCode(
  payload: Record<string, unknown>
): Record<string, unknown> | null {
  const field = Object.keys(CODE_FIELDS).find((name) => typeof payload[name] === "string");
  if (!field) return null;

  const mint = CODE_FIELDS[field];
  if (!mint) return null;

  return { ...payload, [field]: mint() };
}

/** The replacement queue entry: same record, same id, new code, fresh attempt. */
export function remedied(mutation: OutboundMutation): OutboundMutation | null {
  const payload = payloadWithFreshCode(mutation.payload);
  if (!payload) return null;

  return {
    ...mutation,
    // A new mutation id. The old one belongs to the dead letter being cleared,
    // and reusing it would make the two indistinguishable in storage.
    mutationId: globalThis.crypto.randomUUID(),
    payload,
    createdAt: new Date().toISOString(),
    attemptCount: 0,
    lastError: null
  };
}
