import { describe, expect, it } from "vitest";
import { redact } from "./index";

describe("observability redaction", () => {
  it("redacts nested personal and clinical content", () => {
    expect(
      redact({
        requestId: "req-1",
        user: { email: "vet@example.com", phone_e164: "+233241234567" },
        clinical_notes: "restricted",
        safe: "retained"
      })
    ).toEqual({
      requestId: "req-1",
      user: { email: "[REDACTED]", phone_e164: "[REDACTED]" },
      clinical_notes: "[REDACTED]",
      safe: "retained"
    });
  });
});
