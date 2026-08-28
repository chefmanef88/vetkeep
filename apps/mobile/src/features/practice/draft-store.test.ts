import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftForm } from "./visit-types";

/**
 * The store is backed by SecureStore, whose keys are restricted to letters,
 * digits, ".", "-" and "_". The mock enforces that, because a key the real
 * store rejects fails on the device and nowhere else — which is exactly how a
 * separator bug survived into a released build once already.
 */
const KEY_PATTERN = /^[A-Za-z0-9._-]+$/;
const values = new Map<string, string>();

function assertKey(key: string) {
  if (!KEY_PATTERN.test(key)) throw new Error(`Invalid secure store key: ${key}`);
}

vi.mock("@/security/chunked-secure-store", () => ({
  chunkedSecureStore: {
    getItem: vi.fn(async (key: string) => {
      assertKey(key);
      return values.get(key) ?? null;
    }),
    setItem: vi.fn(async (key: string, value: string) => {
      assertKey(key);
      values.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      assertKey(key);
      values.delete(key);
    })
  }
}));

const { clearDraft, differsFrom, loadDraft, saveDraft } = await import("./draft-store");

const VISIT_ID = "9d8d8941-8f1b-43a1-b488-799feecac400";

function form(overrides: Partial<DraftForm> = {}): DraftForm {
  return {
    chiefComplaint: "",
    historyOfComplaint: "",
    pastMedicalHistory: "",
    currentMedications: "",
    temperatureC: "",
    heartRateBpm: "",
    respiratoryRateBpm: "",
    weightValue: "",
    bodyConditionScore: "",
    painScore: "",
    problemList: "",
    differentialDiagnoses: "",
    tentativeDiagnosis: "",
    definitiveDiagnosis: "",
    treatmentPlan: "",
    prescriptions: "",
    followUpPlan: "",
    clinicalNote: "",
    groupSizeAtVisit: "",
    animalsAffected: "",
    animalsDead: "",
    housingUnit: "",
    nextReviewDate: "",
    ...overrides
  };
}

beforeEach(() => {
  values.clear();
  vi.clearAllMocks();
});

describe("draft store", () => {
  it("returns nothing when a record has never been typed into", async () => {
    await expect(loadDraft(VISIT_ID)).resolves.toBeNull();
  });

  it("survives a round trip, which is the whole point", async () => {
    const typed = form({ chiefComplaint: "Coughing for three days", temperatureC: "39.4" });
    await saveDraft(VISIT_ID, typed, 3);

    const restored = await loadDraft(VISIT_ID);
    expect(restored?.form).toEqual(typed);
    expect(restored?.baseServerVersion).toBe(3);
    expect(restored?.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("builds a key the secure store will accept from a uuid", async () => {
    await saveDraft(VISIT_ID, form(), 1);
    expect(values.size).toBeGreaterThan(0);
    for (const key of values.keys()) expect(key).toMatch(KEY_PATTERN);
  });

  it("keeps drafts for different records apart", async () => {
    const other = "11111111-2222-4333-8444-555555555555";
    await saveDraft(VISIT_ID, form({ chiefComplaint: "Lame hind leg" }), 1);
    await saveDraft(other, form({ chiefComplaint: "Off feed" }), 1);

    expect((await loadDraft(VISIT_ID))?.form.chiefComplaint).toBe("Lame hind leg");
    expect((await loadDraft(other))?.form.chiefComplaint).toBe("Off feed");
  });

  it("overwrites rather than accumulating as the vet keeps typing", async () => {
    await saveDraft(VISIT_ID, form({ chiefComplaint: "Cough" }), 1);
    await saveDraft(VISIT_ID, form({ chiefComplaint: "Cough and nasal discharge" }), 1);
    expect((await loadDraft(VISIT_ID))?.form.chiefComplaint).toBe("Cough and nasal discharge");
  });

  it("forgets a draft once the record has been saved", async () => {
    await saveDraft(VISIT_ID, form({ chiefComplaint: "Cough" }), 1);
    await clearDraft(VISIT_ID);
    await expect(loadDraft(VISIT_ID)).resolves.toBeNull();
  });

  it("treats unreadable stored data as absent rather than crashing the screen", async () => {
    // A vet trying to write into a consultation must not meet a parse error.
    values.set(`vetkeep.draft.${VISIT_ID}`, "{not json");
    await expect(loadDraft(VISIT_ID)).resolves.toBeNull();
  });

  it("treats a stored blob that is not a draft as absent", async () => {
    values.set(`vetkeep.draft.${VISIT_ID}`, JSON.stringify({ savedAt: "now" }));
    await expect(loadDraft(VISIT_ID)).resolves.toBeNull();
  });
});

describe("differsFrom", () => {
  it("sees no difference when the draft matches the saved record", () => {
    expect(differsFrom(form({ chiefComplaint: "Cough" }), form({ chiefComplaint: "Cough" }))).toBe(
      false
    );
  });

  it("sees a difference in any field", () => {
    expect(differsFrom(form({ painScore: "2/4" }), form())).toBe(true);
    expect(differsFrom(form({ nextReviewDate: "2026-09-01" }), form())).toBe(true);
  });

  it("treats a missing field as blank rather than as a change", () => {
    const partial = { ...form(), painScore: undefined } as unknown as DraftForm;
    expect(differsFrom(partial, form())).toBe(false);
  });
});
