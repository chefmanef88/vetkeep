import { describe, expect, it, vi } from "vitest";
import { advanceCheckpoint, applyOutcome, decideOutcome, pushBatch } from "./engine";
import { MAX_ATTEMPTS, nextRetryDelayMs, shouldDeadLetter } from "./backoff";
import type {
  OutboundMutation,
  PushResponse,
  SyncCheckpoint,
  SyncStorage,
  EntityType
} from "./types";

function mutation(overrides: Partial<OutboundMutation> = {}): OutboundMutation {
  return {
    mutationId: "m-1",
    entityType: "visit_draft",
    entityId: "v-1",
    operation: "update",
    rpcName: "update_visit_draft",
    payload: {},
    baseServerVersion: 3,
    createdAt: "2026-08-02T10:00:00.000Z",
    attemptCount: 0,
    lastError: null,
    ...overrides
  };
}

/** An in-memory stand-in for whichever local database wins Phase 0. */
function fakeStorage() {
  const queue = new Map<string, OutboundMutation>();
  const dead: { mutation: OutboundMutation; reason: string }[] = [];
  const checkpoints = new Map<string, SyncCheckpoint>();

  const storage: SyncStorage = {
    enqueue: async (m) => {
      queue.set(m.mutationId, m);
    },
    claimBatch: async (limit) => [...queue.values()].slice(0, limit),
    remove: async (id) => {
      queue.delete(id);
    },
    update: async (m) => {
      queue.set(m.mutationId, m);
    },
    moveToDeadLetter: async (m, reason) => {
      queue.delete(m.mutationId);
      dead.push({ mutation: m, reason });
    },
    readCheckpoint: async (name) => checkpoints.get(name) ?? null,
    writeCheckpoint: async (checkpoint) => {
      checkpoints.set(checkpoint.collectionName, checkpoint);
    }
  };

  return { storage, queue, dead, checkpoints };
}

describe("decideOutcome", () => {
  it("accepts a successful push", () => {
    const outcome = decideOutcome(mutation(), { status: "accepted", serverVersion: 4 });
    expect(outcome).toEqual({ kind: "accepted", serverVersion: 4 });
  });

  it("classifies a stale write by what kind of record it is", () => {
    const draft = decideOutcome(mutation({ entityType: "visit_draft" }), {
      status: "stale",
      serverVersion: 5,
      message: "changed on the server"
    });
    expect(draft).toMatchObject({ kind: "conflict", policy: "manual_section" });

    const payment = decideOutcome(mutation({ entityType: "invoice_payment" }), {
      status: "stale",
      serverVersion: 5,
      message: "already applied"
    });
    expect(payment).toMatchObject({ kind: "conflict", policy: "idempotent_never_merge" });
  });

  it("retries a transport failure rather than discarding the write", () => {
    const outcome = decideOutcome(mutation({ attemptCount: 1 }), {
      status: "unavailable",
      message: "no connection"
    });
    expect(outcome.kind).toBe("retry");
  });

  it("dead-letters rather than retrying when the server refused on its own terms", () => {
    // Retrying cannot fix a bad state transition or a revoked device.
    const outcome = decideOutcome(mutation(), {
      status: "rejected",
      code: "42501",
      message: "Active veterinarian account required"
    });
    expect(outcome).toMatchObject({ kind: "dead_letter" });
  });

  it("stops retrying once the attempt budget is spent", () => {
    const outcome = decideOutcome(mutation({ attemptCount: MAX_ATTEMPTS }), {
      status: "unavailable",
      message: "no connection"
    });
    expect(outcome.kind).toBe("dead_letter");
  });
});

describe("applyOutcome", () => {
  it("clears an accepted mutation from the queue", async () => {
    const { storage, queue } = fakeStorage();
    const m = mutation();
    await storage.enqueue(m);
    await applyOutcome(storage, m, { kind: "accepted", serverVersion: 4 });
    expect(queue.size).toBe(0);
  });

  it("keeps a clinical conflict queued and flags it for the vet", async () => {
    const { storage, queue } = fakeStorage();
    const m = mutation({ entityType: "visit_draft" });
    await storage.enqueue(m);

    const result = await applyOutcome(storage, m, {
      kind: "conflict",
      policy: "manual_section",
      serverVersion: 5,
      reason: "both devices edited the assessment"
    });

    expect(result.needsAttention).toBe(true);
    expect(queue.get("m-1")?.lastError).toContain("both devices");
  });

  it("drops a replayed payment instead of asking the vet about it", async () => {
    const { storage, queue } = fakeStorage();
    const m = mutation({ entityType: "invoice_payment" });
    await storage.enqueue(m);

    // The server already recorded this payment under the same id. There is
    // nothing for a human to decide, and prompting would invite double entry.
    const result = await applyOutcome(storage, m, {
      kind: "conflict",
      policy: "idempotent_never_merge",
      serverVersion: 2,
      reason: "already applied"
    });

    expect(result.needsAttention).toBe(false);
    expect(queue.size).toBe(0);
  });

  it("moves an exhausted mutation to the dead letter queue, still visible", async () => {
    const { storage, queue, dead } = fakeStorage();
    const m = mutation();
    await storage.enqueue(m);
    const result = await applyOutcome(storage, m, { kind: "dead_letter", reason: "gave up" });

    expect(queue.size).toBe(0);
    expect(dead).toHaveLength(1);
    // A failed clinical write must never disappear without a trace.
    expect(result.needsAttention).toBe(true);
  });
});

describe("pushBatch", () => {
  it("sends a bounded batch rather than the whole queue", async () => {
    const { storage } = fakeStorage();
    for (let i = 0; i < 10; i += 1) {
      await storage.enqueue(mutation({ mutationId: `m-${i}`, entityId: `v-${i}` }));
    }
    const send = vi.fn(async (): Promise<PushResponse> => ({
      status: "accepted",
      serverVersion: 1
    }));

    const result = await pushBatch(storage, send, { batchSize: 4 });

    expect(result.pushed).toBe(4);
    expect(send).toHaveBeenCalledTimes(4);
  });

  it("stops at the first transport failure instead of burning every retry budget", async () => {
    const { storage } = fakeStorage();
    for (let i = 0; i < 5; i += 1) {
      await storage.enqueue(mutation({ mutationId: `m-${i}`, entityId: `v-${i}` }));
    }

    const send = vi.fn(async (m: OutboundMutation): Promise<PushResponse> => {
      if (m.mutationId === "m-2") return { status: "unavailable", message: "no connection" };
      return { status: "accepted", serverVersion: 1 };
    });

    const result = await pushBatch(storage, send);

    // The connection died at the third mutation; the remaining two are untouched
    // and keep a full retry budget for when signal returns.
    expect(send).toHaveBeenCalledTimes(3);
    expect(result.accepted).toBe(2);
    expect(result.retrying).toBe(1);
  });

  it("keeps going past a conflict, which is about one record not the connection", async () => {
    const { storage } = fakeStorage();
    for (let i = 0; i < 3; i += 1) {
      await storage.enqueue(mutation({ mutationId: `m-${i}`, entityId: `v-${i}` }));
    }

    const send = vi.fn(async (m: OutboundMutation): Promise<PushResponse> => {
      if (m.mutationId === "m-1") {
        return { status: "stale", serverVersion: 9, message: "changed elsewhere" };
      }
      return { status: "accepted", serverVersion: 1 };
    });

    const result = await pushBatch(storage, send);

    expect(send).toHaveBeenCalledTimes(3);
    expect(result.accepted).toBe(2);
    expect(result.conflicted).toBe(1);
  });

  it("does not resend a mutation the server already accepted", async () => {
    const { storage, queue } = fakeStorage();
    await storage.enqueue(mutation({ mutationId: "m-only" }));

    const send = vi.fn(async (): Promise<PushResponse> => ({
      status: "accepted",
      serverVersion: 2
    }));

    await pushBatch(storage, send);
    await pushBatch(storage, send);

    // The second pass has nothing to send: the queue emptied on acceptance.
    expect(send).toHaveBeenCalledTimes(1);
    expect(queue.size).toBe(0);
  });
});

describe("advanceCheckpoint", () => {
  it("moves the cursor only after the pulled page was applied", async () => {
    const { storage, checkpoints } = fakeStorage();

    const skipped = await advanceCheckpoint(storage, "visits", "cursor-2", false);
    expect(skipped).toBe(false);
    // Advancing on a failed apply would skip those records permanently: the next
    // pull would ask for changes after a cursor whose data never landed.
    expect(checkpoints.size).toBe(0);

    const moved = await advanceCheckpoint(
      storage,
      "visits",
      "cursor-2",
      true,
      () => "2026-08-02T12:00:00.000Z"
    );
    expect(moved).toBe(true);
    expect(checkpoints.get("visits")).toEqual({
      collectionName: "visits",
      lastServerCursor: "cursor-2",
      lastSuccessfulSyncAt: "2026-08-02T12:00:00.000Z"
    });
  });
});

describe("backoff", () => {
  it("grows the delay with each attempt", () => {
    expect(nextRetryDelayMs(0)).toBeLessThan(nextRetryDelayMs(1));
    expect(nextRetryDelayMs(1)).toBeLessThan(nextRetryDelayMs(2));
  });

  it("caps the delay so a device that regains signal is not stuck waiting", () => {
    expect(nextRetryDelayMs(50)).toBeLessThanOrEqual(15 * 60 * 1000 * 1.2);
  });

  it("spreads retries so reconnecting devices do not move in lockstep", () => {
    expect(nextRetryDelayMs(3, 0)).toBeLessThan(nextRetryDelayMs(3, 1));
  });

  it("ignores a nonsense jitter rather than producing a nonsense delay", () => {
    expect(nextRetryDelayMs(2, Number.NaN)).toBe(nextRetryDelayMs(2, 0));
    expect(nextRetryDelayMs(2, 5)).toBe(nextRetryDelayMs(2, 1));
  });

  it("gives up only after a genuine run of failures", () => {
    expect(shouldDeadLetter(0)).toBe(false);
    expect(shouldDeadLetter(MAX_ATTEMPTS - 1)).toBe(false);
    expect(shouldDeadLetter(MAX_ATTEMPTS)).toBe(true);
  });
});

describe("entity coverage", () => {
  it("classifies every entity type the queue can carry", () => {
    // A new syncable table must not reach the queue without a policy: the closed
    // union makes that a compile error, and this guards the runtime path too.
    const types: EntityType[] = ["client", "visit_draft", "invoice_payment"];
    for (const entityType of types) {
      const outcome = decideOutcome(mutation({ entityType }), {
        status: "stale",
        serverVersion: 1,
        message: "x"
      });
      expect(outcome.kind).toBe("conflict");
    }
  });
});
