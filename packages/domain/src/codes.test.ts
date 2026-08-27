import { describe, expect, it } from "vitest";
import {
  CLIENT_CODE_PATTERN,
  PATIENT_CODE_PATTERN,
  callWithFreshCode,
  generateClientCode,
  generatePatientCode,
  generateVisitRecordCode,
  isCodeCollision,
  normalizeRecordCode
} from "./codes";

/** What PostgREST actually returns when a device-minted code is already taken. */
const collision = {
  code: "23505",
  message: 'duplicate key value violates unique constraint "visits_vet_record_code_idx"',
  details: "Key (vet_id, record_code)=(2f1c, VK-R-ABCDEF) already exists."
};

describe("record code generation", () => {
  it("produces client codes the database will accept", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateClientCode()).toMatch(CLIENT_CODE_PATTERN);
    }
  });

  it("produces patient codes the database will accept", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generatePatientCode()).toMatch(PATIENT_CODE_PATTERN);
    }
  });

  it("never emits the characters that are misread when a code is read aloud", () => {
    const codes = Array.from({ length: 500 }, () => generateClientCode() + generatePatientCode());
    // I, L and O are excluded so they cannot be confused with 1 and 0; U is
    // excluded to avoid accidental obscenities.
    expect(codes.join("").replace(/^VK-[CP]-/gm, "")).not.toMatch(/[ILOU]/);
  });

  it("does not collide across a realistic single-account volume", () => {
    // Tolerance rather than zero, and not because collisions are acceptable.
    // The alphabet gives 32^6 = 1,073,741,824 codes, so 5000 draws form
    // 12,497,500 pairs and collide with probability 1 - e^-0.0116, about 1.2%.
    // Asserting exactly 5000 unique fails roughly one run in eighty-five, which
    // is what it did on main rather than in anyone's editor.
    //
    // What this test is for is a generator that has stopped being random —
    // a constant, a short period, a stubbed crypto source. Those produce
    // duplicates by the hundred, so a handful of slack still catches them
    // while making a false failure vanishingly unlikely. Real uniqueness is
    // the database's unique index, which does not deal in probability.
    const generated = new Set(Array.from({ length: 5000 }, () => generateClientCode()));
    expect(generated.size).toBeGreaterThanOrEqual(4995);
  });
});

describe("isCodeCollision", () => {
  it("recognises a repeated code on each of the three series", () => {
    expect(isCodeCollision(collision)).toBe(true);
    for (const constraint of [
      "clients_vet_id_client_code_key",
      "patients_vet_id_patient_code_key"
    ]) {
      expect(
        isCodeCollision({
          code: "23505",
          message: `duplicate key value violates unique constraint "${constraint}"`
        })
      ).toBe(true);
    }
  });

  it("does not claim every unique violation", () => {
    // Two animals with the same microchip is a real clinical problem and must
    // not be silently retried under a different code.
    expect(
      isCodeCollision({
        code: "23505",
        message: 'duplicate key value violates unique constraint "patients_microchip_id_key"'
      })
    ).toBe(false);
  });

  it("does not claim refusals that resending cannot fix", () => {
    expect(isCodeCollision({ code: "42501", message: "device revoked" })).toBe(false);
    expect(isCodeCollision({ code: "22023", message: "Invalid heart rate" })).toBe(false);
    expect(isCodeCollision({ message: "network request failed" })).toBe(false);
  });
});

describe("callWithFreshCode", () => {
  it("mints a different code for the retry, not the same one again", async () => {
    const seen: string[] = [];
    const result = await callWithFreshCode(generateVisitRecordCode, (code) => {
      seen.push(code);
      return Promise.resolve({ error: seen.length === 1 ? collision : null });
    });

    expect(result.error).toBeNull();
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it("returns the first success without retrying", async () => {
    let calls = 0;
    const result = await callWithFreshCode(generateClientCode, () => {
      calls += 1;
      return Promise.resolve({ error: null });
    });

    expect(result.error).toBeNull();
    expect(calls).toBe(1);
  });

  it("gives up on a refusal a new code cannot fix", async () => {
    // Retrying a revoked device three times just delays telling the vet.
    let calls = 0;
    const revoked = { code: "42501", message: "device revoked" };
    const result = await callWithFreshCode(generateClientCode, () => {
      calls += 1;
      return Promise.resolve({ error: revoked });
    });

    expect(result.error).toBe(revoked);
    expect(calls).toBe(1);
  });

  it("stops after the attempt limit rather than looping", async () => {
    let calls = 0;
    const result = await callWithFreshCode(generateClientCode, () => {
      calls += 1;
      return Promise.resolve({ error: collision });
    });

    expect(calls).toBe(3);
    expect(result.error).toBe(collision);
  });
});

describe("normalizeRecordCode", () => {
  it("accepts a code that was typed in lower case with stray whitespace", () => {
    expect(normalizeRecordCode("  vk-c-9k3m7t  ")).toBe("VK-C-9K3M7T");
  });

  it("resolves the Crockford aliases a person types by hand", () => {
    // A vet reading a code off a note writes O for zero and I or L for one.
    expect(normalizeRecordCode("VK-P-4QOT6R")).toBe("VK-P-4Q0T6R");
    expect(normalizeRecordCode("VK-P-4QIT6R")).toBe("VK-P-4Q1T6R");
    expect(normalizeRecordCode("VK-P-4QLT6R")).toBe("VK-P-4Q1T6R");
  });

  it("returns null rather than a usable-looking value when the code is wrong", () => {
    expect(normalizeRecordCode("VK-C-TOOLONG9")).toBeNull();
    expect(normalizeRecordCode("VK-X-9K3M7T")).toBeNull();
    expect(normalizeRecordCode("9K3M7T")).toBeNull();
    expect(normalizeRecordCode("")).toBeNull();
  });
});

describe("generateVisitRecordCode", () => {
  it("produces a VK-R- code in the shared alphabet", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateVisitRecordCode()).toMatch(/^VK-R-[0-9A-HJKMNP-TV-Z]{6}$/);
    }
  });

  it("never emits the characters that are misread when a code is read aloud", () => {
    // I, L and O become 1, 1 and 0 down a telephone; U is excluded to avoid
    // accidental obscenities. This is the whole reason for a custom alphabet.
    const segments = Array.from({ length: 500 }, () => generateVisitRecordCode().slice(5));
    expect(segments.join("")).not.toMatch(/[ILOU]/);
  });

  it("does not repeat itself across a practice-sized run", () => {
    // Not a uniqueness proof — the database holds a unique index for that. It
    // catches a generator that has stopped being random, which no constraint
    // would report until two records collided in the field.
    //
    // Same reasoning as the client-code volume test: 2000 draws collide about
    // once in every 540 runs by chance, so this allows a little slack and still
    // fails loudly on a generator that has genuinely stopped varying.
    const codes = new Set(Array.from({ length: 2000 }, generateVisitRecordCode));
    expect(codes.size).toBeGreaterThanOrEqual(1997);
  });

  it("is a different series from the client and patient codes", () => {
    // A record reference and an animal file are different things, and a
    // document that confuses them sends someone to the wrong folder.
    expect(generateVisitRecordCode().startsWith("VK-R-")).toBe(true);
    expect(generateClientCode().startsWith("VK-R-")).toBe(false);
    expect(generatePatientCode().startsWith("VK-R-")).toBe(false);
  });

  it("is accepted by the normalizer, including from a handwritten note", () => {
    const code = generateVisitRecordCode();
    expect(normalizeRecordCode(code)).toBe(code);
    expect(normalizeRecordCode("  vk-r-9k3m7t  ")).toBe("VK-R-9K3M7T");
  });
});
