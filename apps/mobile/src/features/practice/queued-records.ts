/**
 * Reading a record back out of the outbound queue.
 *
 * A section that has just queued a write has nowhere else to find it. The
 * server has not seen it, and the folder does not read from the local database
 * yet — so without this, a vet with no signal records a euthanasia, the screen
 * re-reads from the server, finds nothing, and goes back to offering the button
 * that records one. They would reasonably press it again.
 *
 * The queue is a local store holding the exact payload that was submitted, so
 * the record can be rebuilt from it. That survives an app restart, which an
 * optimistic flag held in component state would not — and the restart is the
 * case that matters, because that is when the vet comes back to the folder and
 * sees whether their work is still there.
 *
 * These are the shapes the sections already render, so a queued record and a
 * sent one look the same apart from being marked as waiting.
 */

import type { OutboundMutation } from "@vetkeep/sync";

import type { ConsentRow } from "./consent-block";
import type { EuthanasiaRow } from "./euthanasia-section";

/** A record rebuilt from the queue rather than read from the server. */
export type Queued<T> = T & { pendingSend: true };

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optional(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/**
 * `performed_at` and `granted_at` are set by the server, so a queued record has
 * no value for them yet. The time the write was queued is the closest honest
 * answer: it is when the vet performed the act, which is what the column means.
 */
function queuedAt(mutation: OutboundMutation): string {
  return mutation.createdAt;
}

export function queuedEuthanasia(
  pending: readonly OutboundMutation[],
  visitId: string
): Queued<EuthanasiaRow> | null {
  const mutation = pending.find(
    (candidate) =>
      candidate.rpcName === "record_euthanasia" && candidate.payload.p_visit_id === visitId
  );
  if (!mutation) return null;

  const payload = mutation.payload;
  return {
    id: text(payload.p_id),
    reason: text(payload.p_reason),
    reason_detail: text(payload.p_reason_detail),
    method: text(payload.p_method),
    agent: optional(payload.p_agent),
    death_confirmed: payload.p_death_confirmed === true,
    death_confirmed_by: optional(payload.p_death_confirmed_by),
    animals_count: count(payload.p_animals_count),
    carcass_disposal: optional(payload.p_carcass_disposal),
    performed_at: queuedAt(mutation),
    pendingSend: true
  };
}

/**
 * Both link ids are returned, because the callers already filter on them: the
 * surgery section narrows to one procedure, the euthanasia section to one
 * death. Returning only the one a caller happens to need would mean two
 * near-identical functions.
 */
export type QueuedConsent = Queued<
  ConsentRow & {
    euthanasia_record_id: string | null;
    surgical_procedure_id: string | null;
  }
>;

export function queuedConsents(
  pending: readonly OutboundMutation[],
  visitId: string,
  consentFor: string
): QueuedConsent[] {
  return pending
    .filter(
      (candidate) =>
        candidate.rpcName === "record_consent" &&
        candidate.payload.p_visit_id === visitId &&
        candidate.payload.p_consent_for === consentFor
    )
    .map((mutation) => {
      const payload = mutation.payload;
      return {
        id: text(payload.p_id),
        granted_by_name: text(payload.p_granted_by_name),
        granted_by_capacity: text(payload.p_granted_by_capacity),
        method: text(payload.p_method),
        witness_name: optional(payload.p_witness_name),
        risks_explained: text(payload.p_risks_explained),
        granted_at: queuedAt(mutation),
        // Filled in by applyQueuedWithdrawals, which looks for a queued
        // withdrawal of this same id. A consent can be withdrawn before it was
        // ever sent, and the display has to say so.
        withdrawn_at: null,
        withdrawal_reason: null,
        euthanasia_record_id: optional(payload.p_euthanasia_record_id),
        surgical_procedure_id: optional(payload.p_surgical_procedure_id),
        pendingSend: true
      };
    });
}

/**
 * Marks consents whose withdrawal is queued but not yet sent.
 *
 * Applies to rows from the server as well as queued ones. A vet who withdraws
 * a consent with no signal must not see it still standing — that is the one
 * state where showing the stale value could lead to a procedure going ahead on
 * a consent that has been taken back.
 */
export function applyQueuedWithdrawals<
  T extends { id: string; withdrawn_at: string | null; withdrawal_reason: string | null }
>(rows: readonly T[], pending: readonly OutboundMutation[]): T[] {
  const withdrawals = new Map<string, OutboundMutation>();
  for (const mutation of pending) {
    if (mutation.rpcName !== "withdraw_consent") continue;
    const id = mutation.payload.p_id;
    if (typeof id === "string") withdrawals.set(id, mutation);
  }
  if (withdrawals.size === 0) return [...rows];

  return rows.map((row) => {
    const withdrawal = withdrawals.get(row.id);
    if (!withdrawal || row.withdrawn_at !== null) return row;
    const reason = withdrawal.payload.p_reason;
    return {
      ...row,
      withdrawn_at: withdrawal.createdAt,
      withdrawal_reason: typeof reason === "string" && reason.length > 0 ? reason : null
    };
  });
}

/**
 * Server rows first, then anything queued the server has not returned.
 *
 * Matched on id rather than appended blindly: the moment a queued write is
 * accepted the same record arrives from both sides, and for a short window
 * between the send and the next read it can be in both lists at once.
 */
export function withQueued<T extends { id: string }>(
  fromServer: readonly T[],
  fromQueue: readonly Queued<T>[]
): (T | Queued<T>)[] {
  const seen = new Set(fromServer.map((row) => row.id));
  return [...fromServer, ...fromQueue.filter((row) => !seen.has(row.id))];
}
