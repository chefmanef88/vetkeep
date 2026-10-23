import type { OutboundMutation } from "@vetkeep/sync";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { migrate } from "../db/schema";
import { createTestDatabase, type TestDatabase } from "../db/database.test-support";

/**
 * The keychain, as a plain map. What is being tested is whether the work moves
 * and whether the keychain is cleared only once it has — not the chunking,
 * which chunked-secure-store has its own tests for.
 */
const store = new Map<string, string>();

vi.mock("@/security/chunked-secure-store", () => ({
  chunkedSecureStore: {
    getItem: (key: string) => Promise.resolve(store.get(key) ?? null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    }
  }
}));

const { adoptKeychainQueue } = await import("./queue-adoption");
const { createSqliteQueueStorage } = await import("./sqlite-queue-storage");
const { CHECKPOINT_KEY, DEAD_KEY, QUEUE_KEY } = await import("./queue-keys");
const { row } = await import("./rows.test-support");

function mutation(overrides: Partial<OutboundMutation> = {}): OutboundMutation {
  return {
    mutationId: "m1",
    entityType: "visit_draft",
    entityId: "v1",
    operation: "update",
    rpcName: "update_visit_draft",
    payload: { clinical_note: "unsent for three days" },
    baseServerVersion: 2,
    createdAt: "2026-10-14T07:30:00.000Z",
    attemptCount: 1,
    lastError: "offline",
    ...overrides
  };
}

let db: TestDatabase;
let storage: ReturnType<typeof createSqliteQueueStorage>;

beforeEach(async () => {
  store.clear();
  db = createTestDatabase();
  await migrate(db);
  storage = createSqliteQueueStorage(db);
});

describe("adoptKeychainQueue", () => {
  it("does nothing when the keychain is empty", async () => {
    const result = await adoptKeychainQueue(storage);
    expect(result).toEqual({ mutations: 0, deadLetters: 0, checkpoints: 0, adopted: false });
    expect(await storage.pendingCount()).toBe(0);
  });

  it("moves unsent mutations across and clears the keychain", async () => {
    const a = mutation({ mutationId: "a" });
    const b = mutation({ mutationId: "b", createdAt: "2026-10-15T07:30:00.000Z" });
    store.set(QUEUE_KEY, JSON.stringify([a, b]));

    const result = await adoptKeychainQueue(storage);

    expect(result.adopted).toBe(true);
    expect(result.mutations).toBe(2);
    expect((await storage.pending()).map((m) => m.mutationId)).toEqual(["a", "b"]);
    expect(store.has(QUEUE_KEY)).toBe(false);
  });

  it("preserves the payload exactly", async () => {
    // This is a consultation note that exists nowhere else.
    const m = mutation({ payload: { clinical_note: "Lame left fore. Advised box rest." } });
    store.set(QUEUE_KEY, JSON.stringify([m]));

    await adoptKeychainQueue(storage);

    const entry = row(await storage.pending());
    expect(entry.payload).toEqual({ clinical_note: "Lame left fore. Advised box rest." });
    expect(entry.baseServerVersion).toBe(2);
    expect(entry.createdAt).toBe("2026-10-14T07:30:00.000Z");
  });

  it("carries dead letters over with their reason", async () => {
    const m = mutation({ mutationId: "dead" });
    store.set(DEAD_KEY, JSON.stringify([{ mutation: m, reason: "code taken", failedAt: "x" }]));

    const result = await adoptKeychainQueue(storage);

    expect(result.deadLetters).toBe(1);
    const dead = await storage.deadLetters();
    expect(dead).toHaveLength(1);
    expect(row(dead).mutation.mutationId).toBe("dead");
    expect(row(dead).reason).toBe("code taken");
    // It must not also be sitting in the live queue.
    expect(await storage.pendingCount()).toBe(0);
  });

  it("carries checkpoints over", async () => {
    store.set(
      CHECKPOINT_KEY,
      JSON.stringify({
        visits: {
          collectionName: "visits",
          lastServerCursor: "cursor-9",
          lastSuccessfulSyncAt: "2026-10-13T06:00:00.000Z"
        }
      })
    );

    const result = await adoptKeychainQueue(storage);

    expect(result.checkpoints).toBe(1);
    expect((await storage.readCheckpoint("visits"))?.lastServerCursor).toBe("cursor-9");
  });

  it("leaves the keychain untouched if the move fails", async () => {
    store.set(QUEUE_KEY, JSON.stringify([mutation()]));
    // The table is gone, so enqueue throws part way through.
    await db.execAsync("drop table outbound_mutations");

    await expect(adoptKeychainQueue(storage)).rejects.toThrow();

    // The work must still be there to try again on the next launch.
    expect(store.has(QUEUE_KEY)).toBe(true);
    expect(JSON.parse(store.get(QUEUE_KEY)!)).toHaveLength(1);
  });

  it("is safe to run twice", async () => {
    const m = mutation();
    store.set(QUEUE_KEY, JSON.stringify([m]));

    await adoptKeychainQueue(storage);
    // Second launch: keychain is empty now, and nothing is duplicated.
    const second = await adoptKeychainQueue(storage);

    expect(second.adopted).toBe(false);
    expect(await storage.pendingCount()).toBe(1);
  });

  it("drops a malformed row rather than queueing something unsendable", async () => {
    store.set(
      QUEUE_KEY,
      JSON.stringify([
        mutation({ mutationId: "good" }),
        { mutationId: "no-rpc-name", entityType: "visit_draft" },
        { operation: "upsert", mutationId: "bad-op", entityType: "v", entityId: "1", rpcName: "r" },
        null
      ])
    );

    const result = await adoptKeychainQueue(storage);

    expect(result.mutations).toBe(1);
    expect((await storage.pending()).map((m) => m.mutationId)).toEqual(["good"]);
    // The keychain is still cleared: those rows could never have been sent.
    expect(store.has(QUEUE_KEY)).toBe(false);
  });

  it("survives an unparseable keychain value", async () => {
    store.set(QUEUE_KEY, "{interrupted mid-write");

    const result = await adoptKeychainQueue(storage);

    expect(result.adopted).toBe(false);
    expect(await storage.pendingCount()).toBe(0);
  });
});
