import { describe, expect, it } from "vitest";
import { CODE_TAKEN, PATIENT_CODE_PATTERN, RECORD_CODE_PATTERN } from "@vetkeep/domain";
import type { OutboundMutation } from "@vetkeep/sync";
import { isCodeTakenReason, payloadWithFreshCode, remedied } from "./code-remedy";

function mutation(payload: Record<string, unknown>): OutboundMutation {
  return {
    mutationId: "mutation-1",
    entityType: "visit",
    entityId: "visit-1",
    operation: "create",
    rpcName: "create_visit",
    payload,
    baseServerVersion: null,
    createdAt: "2026-08-20T09:00:00.000Z",
    attemptCount: 4,
    lastError: "code_taken: ..."
  };
}

describe("isCodeTakenReason", () => {
  it("recognises the reason the engine writes for a repeated code", () => {
    expect(isCodeTakenReason(`${CODE_TAKEN}: This reference is already used`)).toBe(true);
  });

  it("leaves every other refusal alone", () => {
    // These have no remedy: resending changes nothing, and offering a button
    // that cannot work is worse than offering none.
    expect(isCodeTakenReason("42501: connection to this account is not permitted")).toBe(false);
    expect(isCodeTakenReason("22023: Invalid heart rate")).toBe(false);
    expect(isCodeTakenReason("23505: some other unique constraint")).toBe(false);
  });
});

describe("payloadWithFreshCode", () => {
  it("replaces the record code and touches nothing else", () => {
    const before = {
      p_id: "visit-1",
      p_patient_id: "patient-1",
      p_record_code: "VK-R-ABCDEF",
      p_chief_complaint: "Lethargy"
    };
    const after = payloadWithFreshCode(before);

    expect(after?.p_record_code).not.toBe("VK-R-ABCDEF");
    expect(after?.p_record_code).toMatch(RECORD_CODE_PATTERN);
    // The id must survive: it is what makes this the same record the vet is
    // looking at, and the failed attempt inserted nothing to conflict with.
    expect(after?.p_id).toBe("visit-1");
    expect(after?.p_chief_complaint).toBe("Lethargy");
  });

  it("mints the right series for a patient", () => {
    const after = payloadWithFreshCode({ p_id: "p1", p_patient_code: "VK-P-ABCDEF" });
    expect(after?.p_patient_code).toMatch(PATIENT_CODE_PATTERN);
  });

  it("returns null when the write carries no code to re-mint", () => {
    // A signature or a vital sign has no code. There is nothing to remedy, and
    // the dead letter should be left exactly as it is.
    expect(payloadWithFreshCode({ p_id: "v1", p_heart_rate: 80 })).toBeNull();
  });
});

describe("remedied", () => {
  it("produces a fresh attempt under a new id", () => {
    const original = mutation({ p_id: "visit-1", p_record_code: "VK-R-ABCDEF" });
    const replacement = remedied(original);

    expect(replacement).not.toBeNull();
    // A new mutation id: the old one belongs to the dead letter being cleared.
    expect(replacement?.mutationId).not.toBe("mutation-1");
    expect(replacement?.attemptCount).toBe(0);
    expect(replacement?.lastError).toBeNull();
    // Same record, same RPC, new code.
    expect(replacement?.entityId).toBe("visit-1");
    expect(replacement?.rpcName).toBe("create_visit");
    expect(replacement?.payload.p_record_code).not.toBe("VK-R-ABCDEF");
  });

  it("refuses a mutation with no code rather than queueing a duplicate", () => {
    expect(remedied(mutation({ p_id: "visit-1", p_heart_rate: 80 }))).toBeNull();
  });
});
