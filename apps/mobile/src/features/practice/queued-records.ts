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
import type { PreventiveRow } from "./preventive-section";
import type { ProcedureRow } from "./surgery-section";
import type { TreatmentRow } from "./treatments-section";

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

function number(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function strings(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : null;
}

/**
 * Treatments waiting to send.
 *
 * A dose is the one thing here that cannot be reconstructed from anything else,
 * so a payload without a usable one is skipped rather than shown as a treatment
 * of zero. The form refuses to queue without it, so this is a guard against a
 * row written by a build that is no longer running, not against the current one.
 */
export function queuedTreatments(
  pending: readonly OutboundMutation[],
  visitId: string
): Queued<TreatmentRow>[] {
  const rows: Queued<TreatmentRow>[] = [];

  for (const mutation of pending) {
    if (mutation.rpcName !== "record_treatment") continue;
    if (mutation.payload.p_visit_id !== visitId) continue;

    const dose = number(mutation.payload.p_dose_value);
    if (dose === null) continue;

    const payload = mutation.payload;
    rows.push({
      id: text(payload.p_id),
      product_name: text(payload.p_product_name),
      dose_value: dose,
      dose_unit: text(payload.p_dose_unit),
      route: text(payload.p_route),
      // Set by the server. The time it was queued is when the animal was
      // actually treated, which is what the column means.
      administered_at: queuedAt(mutation),
      duration_days: number(payload.p_duration_days),
      animals_treated: number(payload.p_animals_treated),
      meat_withhold_until: optional(payload.p_meat_withhold_until),
      milk_withhold_until: optional(payload.p_milk_withhold_until),
      eggs_withhold_until: optional(payload.p_eggs_withhold_until),
      withdrawal_source: text(payload.p_withdrawal_source),
      pendingSend: true
    });
  }

  return rows;
}

/**
 * Clients added but not yet sent.
 *
 * Listed so a client added with no signal can still have an animal added under
 * them: the folder is the point of adding the client at all, and making the vet
 * wait for a connection between the two halves of one act would be the worst
 * possible place to stop.
 */
export function queuedClients(pending: readonly OutboundMutation[]): Queued<{
  id: string;
  client_code: string;
  name: string;
  phone_display: string;
  address: string | null;
}>[] {
  return pending
    .filter((candidate) => candidate.rpcName === "create_client")
    .map((mutation) => {
      const payload = mutation.payload;
      return {
        id: text(payload.p_id),
        client_code: text(payload.p_client_code),
        name: text(payload.p_name),
        phone_display: text(payload.p_phone_display),
        address: optional(payload.p_address),
        pendingSend: true
      };
    });
}

/**
 * Surgical procedures waiting to send.
 *
 * The anaesthetic protocol is the part that matters: premedication, induction,
 * maintenance and analgesia are written down while the vet still has them in
 * mind, and none of it can be reconstructed afterwards from the outcome.
 */
export function queuedProcedures(
  pending: readonly OutboundMutation[],
  visitId: string
): Queued<ProcedureRow>[] {
  return pending
    .filter(
      (candidate) =>
        candidate.rpcName === "record_surgical_procedure" &&
        candidate.payload.p_visit_id === visitId
    )
    .map((mutation) => {
      const payload = mutation.payload;
      return {
        id: text(payload.p_id),
        procedure_name: text(payload.p_procedure_name),
        procedure_kind: text(payload.p_procedure_kind),
        anaesthesia: text(payload.p_anaesthesia),
        animals_treated: number(payload.p_animals_treated),
        duration_minutes: number(payload.p_duration_minutes),
        premedication: optional(payload.p_premedication),
        induction_agent: optional(payload.p_induction_agent),
        maintenance_agent: optional(payload.p_maintenance_agent),
        analgesia: optional(payload.p_analgesia),
        monitoring: optional(payload.p_monitoring),
        pre_op_assessment: optional(payload.p_pre_op_assessment),
        post_op_instructions: optional(payload.p_post_op_instructions),
        complications: optional(payload.p_complications),
        outcome: text(payload.p_outcome),
        assistant: optional(payload.p_assistant),
        performed_at: queuedAt(mutation),
        pendingSend: true
      };
    });
}

/**
 * Preventive care waiting to send.
 *
 * server_version is 0 because there is no server row to have a version of.
 * Callers must not offer to edit one of these: an edit would queue an update
 * carrying a base version the server never issued, and it would be rejected as
 * stale the moment the create it depends on lands.
 */
export function queuedPreventive(
  pending: readonly OutboundMutation[],
  patientId: string
): Queued<PreventiveRow>[] {
  return pending
    .filter(
      (candidate) =>
        candidate.rpcName === "record_preventive_care" &&
        candidate.payload.p_patient_id === patientId
    )
    .map((mutation) => {
      const payload = mutation.payload;
      return {
        id: text(payload.p_id),
        kind: text(payload.p_kind),
        target_parasites: strings(payload.p_target_parasites),
        vaccine_type: optional(payload.p_vaccine_type),
        product_name: text(payload.p_product_name),
        manufacturer: optional(payload.p_manufacturer),
        batch_lot_number: optional(payload.p_batch_lot_number),
        dose: optional(payload.p_dose),
        animals_treated: number(payload.p_animals_treated),
        // Given by the vet rather than by the server, so unlike the others this
        // one is in the payload and is the real date.
        date_given: text(payload.p_date_given),
        next_due_date: optional(payload.p_next_due_date),
        server_version: 0,
        visits: null,
        pendingSend: true
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
