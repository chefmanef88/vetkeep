import { describe, expect, it } from "vitest";
import { canOpenCachedRecordsOffline, shouldRelock } from "./index";

describe("offline authentication policy", () => {
  it("permits an active device inside the 30 day window", () => {
    const now = new Date("2026-07-11T12:00:00Z");
    const lastAuthenticatedAt = new Date("2026-06-20T12:00:00Z");
    expect(canOpenCachedRecordsOffline({ lastAuthenticatedAt, now })).toBe(true);
  });

  it("rejects a revoked device", () => {
    const now = new Date("2026-07-11T12:00:00Z");
    expect(
      canOpenCachedRecordsOffline({
        lastAuthenticatedAt: new Date("2026-07-10T12:00:00Z"),
        revokedAt: new Date("2026-07-11T10:00:00Z"),
        now
      })
    ).toBe(false);
  });

  it("relocks after inactivity", () => {
    const now = new Date("2026-07-11T12:05:00Z");
    expect(shouldRelock({ lastActiveAt: new Date("2026-07-11T12:00:00Z"), now })).toBe(true);
  });
});
