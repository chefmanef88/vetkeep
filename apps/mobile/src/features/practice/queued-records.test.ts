import type { OutboundMutation } from "@vetkeep/sync";
import { describe, expect, it } from "vitest";

import {
  applyQueuedWithdrawals,
  queuedConsents,
  queuedEuthanasia,
  withQueued
} from "./queued-records";

function queued(overrides: Partial<OutboundMutation> = {}): OutboundMutation {
  return {
    mutationId: "mut-1",
    entityType: "euthanasia_record",
    entityId: "e1",
    operation: "create",
    rpcName: "record_euthanasia",
    payload: {},
    baseServerVersion: null,
    createdAt: "2026-10-20T09:15:00.000Z",
    attemptCount: 0,
    lastError: null,
    ...overrides
  };
}

const euthanasiaPayload = {
  p_id: "e1",
  p_visit_id: "v1",
  p_reason: "suffering",
  p_reason_detail: "Untreatable fracture, in pain since yesterday.",
  p_method: "injectable",
  p_agent: "Pentobarbital 20ml IV",
  p_death_confirmed: true,
  p_death_confirmed_by: "No heartbeat on auscultation for two minutes",
  p_carcass_disposal: "Buried on the farm"
};

describe("queuedEuthanasia", () => {
  it("finds nothing when the queue is empty", () => {
    expect(queuedEuthanasia([], "v1")).toBeNull();
  });

  it("rebuilds the record the vet just saved", () => {
    const record = queuedEuthanasia([queued({ payload: euthanasiaPayload })], "v1");

    expect(record).toEqual({
      id: "e1",
      reason: "suffering",
      reason_detail: "Untreatable fracture, in pain since yesterday.",
      method: "injectable",
      agent: "Pentobarbital 20ml IV",
      death_confirmed: true,
      death_confirmed_by: "No heartbeat on auscultation for two minutes",
      animals_count: null,
      carcass_disposal: "Buried on the farm",
      // The server has not set performed_at, so the time it was queued stands
      // in — which is when the vet performed it.
      performed_at: "2026-10-20T09:15:00.000Z",
      pendingSend: true
    });
  });

  it("ignores a record queued for another visit", () => {
    // Otherwise one folder would show another animal's death.
    const other = queued({ payload: { ...euthanasiaPayload, p_visit_id: "v2" } });
    expect(queuedEuthanasia([other], "v1")).toBeNull();
  });

  it("ignores other kinds of queued write", () => {
    const treatment = queued({ rpcName: "record_treatment", payload: { p_visit_id: "v1" } });
    expect(queuedEuthanasia([treatment], "v1")).toBeNull();
  });

  it("carries the animal count for a group", () => {
    const record = queuedEuthanasia(
      [queued({ payload: { ...euthanasiaPayload, p_animals_count: 12 } })],
      "v1"
    );
    expect(record?.animals_count).toBe(12);
  });

  it("treats a missing confirmation as not confirmed", () => {
    // Absent must not read as true: this is the claim that the animal is dead.
    const record = queuedEuthanasia(
      [queued({ payload: { ...euthanasiaPayload, p_death_confirmed: undefined } })],
      "v1"
    );
    expect(record?.death_confirmed).toBe(false);
  });
});

describe("queuedConsents", () => {
  const consentPayload = {
    p_id: "c1",
    p_visit_id: "v1",
    p_consent_for: "euthanasia",
    p_granted_by_name: "Kofi Mensah",
    p_granted_by_capacity: "owner",
    p_method: "verbal",
    p_risks_explained: "Explained that it cannot be reversed.",
    p_euthanasia_record_id: "e1"
  };

  it("rebuilds a queued consent", () => {
    const [consent] = queuedConsents(
      [queued({ rpcName: "record_consent", payload: consentPayload })],
      "v1",
      "euthanasia"
    );

    expect(consent).toMatchObject({
      id: "c1",
      granted_by_name: "Kofi Mensah",
      granted_by_capacity: "owner",
      method: "verbal",
      witness_name: null,
      risks_explained: "Explained that it cannot be reversed.",
      withdrawn_at: null,
      euthanasia_record_id: "e1",
      surgical_procedure_id: null,
      pendingSend: true
    });
  });

  it("keeps surgery and euthanasia consents apart", () => {
    const surgery = queued({
      rpcName: "record_consent",
      payload: {
        ...consentPayload,
        p_id: "c2",
        p_consent_for: "surgery",
        p_surgical_procedure_id: "s1",
        p_euthanasia_record_id: undefined
      }
    });
    const pending = [queued({ rpcName: "record_consent", payload: consentPayload }), surgery];

    expect(queuedConsents(pending, "v1", "euthanasia").map((c) => c.id)).toEqual(["c1"]);
    const [onlySurgery] = queuedConsents(pending, "v1", "surgery");
    expect(onlySurgery?.id).toBe("c2");
    expect(onlySurgery?.surgical_procedure_id).toBe("s1");
  });

  it("ignores consents for another visit", () => {
    const other = queued({
      rpcName: "record_consent",
      payload: { ...consentPayload, p_visit_id: "v9" }
    });
    expect(queuedConsents([other], "v1", "euthanasia")).toEqual([]);
  });
});

describe("withQueued", () => {
  it("keeps server rows and adds queued ones", () => {
    const merged = withQueued([{ id: "a" }], [{ id: "b", pendingSend: true }]);
    expect(merged.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("does not show a record twice once it has been accepted", () => {
    // Between the send and the next read, the same record is in both lists.
    const merged = withQueued([{ id: "a" }], [{ id: "a", pendingSend: true }]);
    expect(merged).toEqual([{ id: "a" }]);
  });

  it("prefers the server's copy of a record in both", () => {
    const merged = withQueued(
      [{ id: "a", granted_by_name: "from server" }],
      [{ id: "a", granted_by_name: "from queue", pendingSend: true as const }]
    );
    expect(merged[0]).not.toHaveProperty("pendingSend");
  });
});

describe("applyQueuedWithdrawals", () => {
  const standing = { id: "c1", withdrawn_at: null, withdrawal_reason: null };

  it("leaves rows alone when nothing is queued", () => {
    expect(applyQueuedWithdrawals([standing], [])).toEqual([standing]);
  });

  it("marks a consent whose withdrawal is waiting to send", () => {
    // The state that matters: a vet withdrew consent with no signal, and must
    // not see it still standing — a procedure could go ahead on a consent that
    // has been taken back.
    const withdrawal = queued({
      rpcName: "withdraw_consent",
      payload: { p_id: "c1", p_reason: "Owner changed their mind" }
    });

    const [row] = applyQueuedWithdrawals([standing], [withdrawal]);
    expect(row).toEqual({
      id: "c1",
      withdrawn_at: "2026-10-20T09:15:00.000Z",
      withdrawal_reason: "Owner changed their mind"
    });
  });

  it("does not overwrite a withdrawal the server already recorded", () => {
    const already = {
      id: "c1",
      withdrawn_at: "2026-10-19T08:00:00.000Z",
      withdrawal_reason: "Recorded earlier"
    };
    const withdrawal = queued({
      rpcName: "withdraw_consent",
      payload: { p_id: "c1", p_reason: "later attempt" }
    });

    expect(applyQueuedWithdrawals([already], [withdrawal])).toEqual([already]);
  });

  it("only touches the consent named by the withdrawal", () => {
    const other = { id: "c2", withdrawn_at: null, withdrawal_reason: null };
    const withdrawal = queued({
      rpcName: "withdraw_consent",
      payload: { p_id: "c1", p_reason: "r" }
    });

    const rows = applyQueuedWithdrawals([standing, other], [withdrawal]);
    expect(rows[1]).toEqual(other);
  });

  it("records a withdrawal with no reason as withdrawn", () => {
    const withdrawal = queued({ rpcName: "withdraw_consent", payload: { p_id: "c1" } });
    const [row] = applyQueuedWithdrawals([standing], [withdrawal]);
    expect(row?.withdrawn_at).toBe("2026-10-20T09:15:00.000Z");
    expect(row?.withdrawal_reason).toBeNull();
  });
});
