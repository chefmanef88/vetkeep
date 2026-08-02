import { describe, expect, it } from "vitest";
import {
  CLIENT_CODE_PATTERN,
  PATIENT_CODE_PATTERN,
  generateClientCode,
  generatePatientCode,
  normalizeRecordCode
} from "./codes";

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
    const generated = new Set(Array.from({ length: 5000 }, () => generateClientCode()));
    expect(generated.size).toBe(5000);
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
