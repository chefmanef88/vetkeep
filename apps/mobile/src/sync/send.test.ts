import { describe, expect, it, vi } from "vitest";
import type { OutboundMutation } from "@vetkeep/sync";
import { STALE_WRITE_CODE, classifyRpcError, createSender } from "./send";

function mutation(overrides: Partial<OutboundMutation> = {}): OutboundMutation {
  return {
    mutationId: "visit_draft:v-1",
    entityType: "visit_draft",
    entityId: "v-1",
    operation: "update",
    rpcName: "update_visit_draft",
    payload: { p_id: "v-1" },
    baseServerVersion: 3,
    createdAt: "2026-08-02T10:00:00.000Z",
    attemptCount: 0,
    lastError: null,
    ...overrides
  };
}

describe("classifyRpcError", () => {
  it("recognises the serialization failure the database raises for a stale write", () => {
    const response = classifyRpcError(
      { code: STALE_WRITE_CODE, message: "This consultation changed on another device" },
      3
    );
    expect(response).toMatchObject({ status: "stale", serverVersion: 3 });
  });

  it("treats a transport failure as retryable, not as a rejection", () => {
    // Dead-lettering this would discard a consultation the vet did write.
    for (const message of [
      "Network request failed",
      "fetch failed",
      "Failed to fetch",
      "The request timed out",
      "connection reset"
    ]) {
      expect(classifyRpcError({ message }, 1).status).toBe("unavailable");
    }
  });

  it("treats a database error as a rejection even when its text mentions the network", () => {
    // A PostgreSQL code means the request reached the database and was refused.
    // Retrying it eight times would hide the real reason for several minutes.
    const response = classifyRpcError(
      { code: "42501", message: "connection to this account is not permitted" },
      1
    );
    expect(response).toMatchObject({ status: "rejected", code: "42501" });
  });

  it("rejects an unrecognised failure rather than retrying it forever", () => {
    const response = classifyRpcError({ code: "22023", message: "Invalid heart rate" }, 1);
    expect(response).toMatchObject({ status: "rejected", code: "22023" });
  });

  it("labels a coded-but-unknown failure rather than guessing", () => {
    expect(classifyRpcError({ message: "something odd happened" }, 1)).toMatchObject({
      status: "rejected",
      code: "unknown"
    });
  });
});

describe("createSender", () => {
  it("reports acceptance with the version the record now holds", async () => {
    const send = createSender({
      callRpc: async () => ({ error: null }),
      readServerVersion: async () => 99
    });
    await expect(send(mutation({ baseServerVersion: 3 }))).resolves.toEqual({
      status: "accepted",
      serverVersion: 4
    });
  });

  it("reads the real server version on a conflict instead of parsing the message", async () => {
    const readServerVersion = vi.fn(async () => 7);
    const send = createSender({
      callRpc: async () => ({
        error: { code: STALE_WRITE_CODE, message: "changed on another device" }
      }),
      readServerVersion
    });

    const response = await send(mutation());

    expect(response).toMatchObject({ status: "stale", serverVersion: 7 });
    expect(readServerVersion).toHaveBeenCalledWith("visit_draft", "v-1");
  });

  it("still reports the conflict when the follow-up read also fails", async () => {
    const send = createSender({
      callRpc: async () => ({
        error: { code: STALE_WRITE_CODE, message: "changed on another device" }
      }),
      readServerVersion: async () => {
        throw new Error("offline");
      }
    });

    // The conflict is real whether or not the version can be fetched. Losing it
    // here would silently apply the stale write on the next attempt.
    await expect(send(mutation())).resolves.toMatchObject({ status: "stale" });
  });

  it("treats a thrown error as the network rather than a refusal", async () => {
    const send = createSender({
      callRpc: async () => {
        throw new TypeError("Network request failed");
      },
      readServerVersion: async () => 1
    });
    await expect(send(mutation())).resolves.toMatchObject({ status: "unavailable" });
  });

  it("passes the queued payload through untouched", async () => {
    const callRpc = vi.fn(async () => ({ error: null }));
    const send = createSender({ callRpc, readServerVersion: async () => 1 });

    await send(mutation({ payload: { p_id: "v-1", p_chief_complaint: "Limping" } }));

    expect(callRpc).toHaveBeenCalledWith("update_visit_draft", {
      p_id: "v-1",
      p_chief_complaint: "Limping"
    });
  });
});
