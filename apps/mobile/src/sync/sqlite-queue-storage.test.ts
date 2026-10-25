import type { OutboundMutation } from "@vetkeep/sync";
import { beforeEach, describe, expect, it } from "vitest";

// Relative, like every other test here: there is no vitest config, so the
// "@/" alias the app code uses is not resolved at test time.
import { migrate } from "../db/schema";
import { createTestDatabase, type TestDatabase } from "../db/database.test-support";

import { createSqliteQueueStorage, type SqliteQueueStorage } from "./sqlite-queue-storage";
import { row } from "./rows.test-support";

function mutation(overrides: Partial<OutboundMutation> = {}): OutboundMutation {
  return {
    mutationId: "m1",
    entityType: "visit_draft",
    entityId: "v1",
    operation: "update",
    rpcName: "update_visit_draft",
    payload: { clinical_note: "quiet, eating" },
    baseServerVersion: 3,
    createdAt: "2026-10-16T09:00:00.000Z",
    attemptCount: 0,
    lastError: null,
    ...overrides
  };
}

let db: TestDatabase;
let storage: SqliteQueueStorage;

beforeEach(async () => {
  db = createTestDatabase();
  await migrate(db);
  storage = createSqliteQueueStorage(db);
});

describe("enqueue", () => {
  it("round-trips a mutation unchanged", async () => {
    const m = mutation();
    await storage.enqueue(m);
    expect(await storage.pending()).toEqual([m]);
  });

  it("replaces rather than duplicates the same mutation id", async () => {
    await storage.enqueue(mutation({ payload: { clinical_note: "first" } }));
    await storage.enqueue(mutation({ payload: { clinical_note: "second" } }));

    const pending = await storage.pending();
    expect(pending).toHaveLength(1);
    expect(row(pending).payload).toEqual({ clinical_note: "second" });
  });

  it("resets the retry bookkeeping on replacement", async () => {
    await storage.enqueue(mutation());
    await storage.update(mutation({ attemptCount: 4, lastError: "timed out" }));
    // Different content, so the previous failures are not this write's failures.
    await storage.enqueue(mutation({ payload: { clinical_note: "rewritten" } }));

    const entry = row(await storage.pending());
    expect(entry.attemptCount).toBe(0);
    expect(entry.lastError).toBeNull();
  });

  it("keeps a null baseServerVersion null", async () => {
    // Creates have nothing to be stale against; 0 would be a version.
    await storage.enqueue(mutation({ operation: "create", baseServerVersion: null }));
    const entry = row(await storage.pending());
    expect(entry.baseServerVersion).toBeNull();
  });

  it("holds far more than the keychain ceiling allowed", async () => {
    // Brief 15.2 item 4 asks for at least 10,000 records. The keychain queue
    // refused long before this, which is why the database exists.
    for (let i = 0; i < 10_000; i++) {
      await storage.enqueue(
        mutation({
          mutationId: `m${String(i).padStart(5, "0")}`,
          createdAt: new Date(Date.UTC(2026, 9, 16, 9, 0, 0, 0) + i).toISOString()
        })
      );
    }
    expect(await storage.pendingCount()).toBe(10_000);

    const batch = await storage.claimBatch(50);
    expect(batch).toHaveLength(50);
    expect(row(batch).mutationId).toBe("m00000");
  });
});

describe("claimBatch", () => {
  it("returns oldest first", async () => {
    await storage.enqueue(mutation({ mutationId: "newer", createdAt: "2026-10-16T10:00:00.000Z" }));
    await storage.enqueue(mutation({ mutationId: "older", createdAt: "2026-10-16T08:00:00.000Z" }));

    const batch = await storage.claimBatch(10);
    expect(batch.map((m) => m.mutationId)).toEqual(["older", "newer"]);
  });

  it("breaks a tie on created_at deterministically", async () => {
    // Two writes in the same millisecond must still have a total order, or a
    // batch can interleave differently between runs.
    const at = "2026-10-16T09:00:00.000Z";
    await storage.enqueue(mutation({ mutationId: "b", createdAt: at }));
    await storage.enqueue(mutation({ mutationId: "a", createdAt: at }));
    await storage.enqueue(mutation({ mutationId: "c", createdAt: at }));

    expect((await storage.claimBatch(10)).map((m) => m.mutationId)).toEqual(["a", "b", "c"]);
  });

  it("is bounded by the limit", async () => {
    for (const id of ["a", "b", "c"]) await storage.enqueue(mutation({ mutationId: id }));
    expect(await storage.claimBatch(2)).toHaveLength(2);
  });

  it("returns nothing for a limit of zero or less", async () => {
    await storage.enqueue(mutation());
    expect(await storage.claimBatch(0)).toEqual([]);
    expect(await storage.claimBatch(-1)).toEqual([]);
  });
});

describe("update", () => {
  it("records an attempt without rewriting the payload", async () => {
    await storage.enqueue(mutation());
    await storage.update(
      mutation({ attemptCount: 2, lastError: "offline", payload: { clinical_note: "tampered" } })
    );

    const entry = row(await storage.pending());
    expect(entry.attemptCount).toBe(2);
    expect(entry.lastError).toBe("offline");
    // The idempotency key would be a lie if the content could change under it.
    expect(entry.payload).toEqual({ clinical_note: "quiet, eating" });
  });

  it("ignores a mutation that is no longer queued", async () => {
    await expect(storage.update(mutation({ mutationId: "gone" }))).resolves.toBeUndefined();
    expect(await storage.pendingCount()).toBe(0);
  });
});

describe("moveToDeadLetter", () => {
  it("moves the mutation across in one step", async () => {
    const m = mutation();
    await storage.enqueue(m);
    await storage.moveToDeadLetter(m, "server said no");

    expect(await storage.pending()).toEqual([]);
    const dead = await storage.deadLetters();
    expect(dead).toHaveLength(1);
    expect(row(dead).mutation).toEqual(m);
    expect(row(dead).reason).toBe("server said no");
    expect(row(dead).failedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("leaves the queue untouched if the dead-letter write fails", async () => {
    const m = mutation();
    await storage.enqueue(m);

    // Force the insert to fail inside the transaction. Without a transaction
    // the delete would already have happened and the vet's unsent work would
    // be gone with nothing recorded.
    await db.execAsync("drop table dead_letter_mutations");
    await expect(storage.moveToDeadLetter(m, "whatever")).rejects.toThrow();

    expect(await storage.pendingCount()).toBe(1);
  });

  it("dead-lettering the same id twice does not duplicate it", async () => {
    const m = mutation();
    await storage.enqueue(m);
    await storage.moveToDeadLetter(m, "first");
    await storage.enqueue(m);
    await storage.moveToDeadLetter(m, "second");

    const dead = await storage.deadLetters();
    expect(dead).toHaveLength(1);
    expect(row(dead).reason).toBe("second");
  });
});

describe("clearDeadLetter", () => {
  it("removes just that entry", async () => {
    const a = mutation({ mutationId: "a" });
    const b = mutation({ mutationId: "b" });
    await storage.enqueue(a);
    await storage.moveToDeadLetter(a, "x");
    await storage.enqueue(b);
    await storage.moveToDeadLetter(b, "y");

    await storage.clearDeadLetter("a");
    expect((await storage.deadLetters()).map((d) => d.mutation.mutationId)).toEqual(["b"]);
  });
});

describe("checkpoints", () => {
  it("returns null for a collection never synced", async () => {
    expect(await storage.readCheckpoint("visits")).toBeNull();
  });

  it("round-trips and then overwrites", async () => {
    await storage.writeCheckpoint({
      collectionName: "visits",
      lastServerCursor: "cursor-1",
      lastSuccessfulSyncAt: "2026-10-16T09:00:00.000Z"
    });
    expect(await storage.readCheckpoint("visits")).toEqual({
      collectionName: "visits",
      lastServerCursor: "cursor-1",
      lastSuccessfulSyncAt: "2026-10-16T09:00:00.000Z"
    });

    await storage.writeCheckpoint({
      collectionName: "visits",
      lastServerCursor: "cursor-2",
      lastSuccessfulSyncAt: "2026-10-16T10:00:00.000Z"
    });
    expect((await storage.readCheckpoint("visits"))?.lastServerCursor).toBe("cursor-2");
  });

  it("keeps collections apart", async () => {
    await storage.writeCheckpoint({
      collectionName: "visits",
      lastServerCursor: "v",
      lastSuccessfulSyncAt: null
    });
    await storage.writeCheckpoint({
      collectionName: "patients",
      lastServerCursor: "p",
      lastSuccessfulSyncAt: null
    });

    expect((await storage.readCheckpoint("visits"))?.lastServerCursor).toBe("v");
    expect((await storage.readCheckpoint("patients"))?.lastServerCursor).toBe("p");
  });

  it("accepts a null cursor", async () => {
    await storage.writeCheckpoint({
      collectionName: "visits",
      lastServerCursor: null,
      lastSuccessfulSyncAt: null
    });
    expect(await storage.readCheckpoint("visits")).toEqual({
      collectionName: "visits",
      lastServerCursor: null,
      lastSuccessfulSyncAt: null
    });
  });
});

describe("usedBytes", () => {
  it("is zero on an empty queue", async () => {
    // sum() over no rows is null, not 0.
    expect(await storage.usedBytes()).toBe(0);
  });

  it("grows with what is queued", async () => {
    await storage.enqueue(mutation());
    const one = await storage.usedBytes();
    expect(one).toBeGreaterThan(0);

    await storage.enqueue(mutation({ mutationId: "m2" }));
    expect(await storage.usedBytes()).toBeGreaterThan(one);
  });
});

describe("a payload that will not parse", () => {
  it("comes back empty rather than throwing the read", async () => {
    // Written by a build no longer running, or a write interrupted part way.
    // The queue must stay readable: one bad row cannot hide the rest.
    await db.runAsync(
      `insert into outbound_mutations
         (mutation_id, entity_type, entity_id, operation, rpc_name, payload, created_at)
       values ('bad', 'visit_draft', 'v1', 'update', 'update_visit_draft', '{not json', '2026-10-16T09:00:00.000Z')`
    );
    await storage.enqueue(mutation({ mutationId: "good" }));

    const pending = await storage.pending();
    expect(pending).toHaveLength(2);
    expect(pending.find((m) => m.mutationId === "bad")?.payload).toEqual({});
    expect(pending.find((m) => m.mutationId === "good")?.payload).toEqual({
      clinical_note: "quiet, eating"
    });
  });

  it("treats a non-object payload as empty", async () => {
    await db.runAsync(
      `insert into outbound_mutations
         (mutation_id, entity_type, entity_id, operation, rpc_name, payload, created_at)
       values ('arr', 'visit_draft', 'v1', 'update', 'update_visit_draft', '[1,2]', '2026-10-16T09:00:00.000Z')`
    );
    const entry = row(await storage.pending());
    expect(entry.payload).toEqual({});
  });
});

describe("the operation column", () => {
  it("refuses a value the engine does not define", async () => {
    // The check constraint is the last line of defence against a typo in an
    // rpc name reaching the server as an unknown operation.
    await expect(
      db.runAsync(
        `insert into outbound_mutations
           (mutation_id, entity_type, entity_id, operation, rpc_name, payload, created_at)
         values ('x', 'visit_draft', 'v1', 'upsert', 'r', '{}', '2026-10-16T09:00:00.000Z')`
      )
    ).rejects.toThrow();
  });
});
