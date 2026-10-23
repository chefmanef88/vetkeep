import type { OutboundMutation } from "@vetkeep/sync";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { migrate } from "../db/schema";
import { createTestDatabase, type TestDatabase } from "../db/database.test-support";

/** The keychain, as a plain map, shared with whatever the fallback writes. */
const keychain = new Map<string, string>();

vi.mock("@/security/chunked-secure-store", () => ({
  // The real ceiling, so a fallback that would overflow behaves as it does on
  // a device rather than being silently unbounded here.
  MAX_VALUE_LENGTH: 2048 * 8,
  chunkedSecureStore: {
    getItem: (key: string) => Promise.resolve(keychain.get(key) ?? null),
    setItem: (key: string, value: string) => {
      keychain.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      keychain.delete(key);
      return Promise.resolve();
    }
  }
}));

const openLocalDatabase = vi.fn();
vi.mock("@/db/open", () => ({ openLocalDatabase: () => openLocalDatabase() }));

const getOrCreateDatabaseKey = vi.fn(async () => "a".repeat(64));
vi.mock("@/db/encryption-key", () => ({
  getOrCreateDatabaseKey: () => getOrCreateDatabaseKey()
}));

const { createLocalQueueStorage, SQLCIPHER_ENABLED } = await import("./local-queue-storage");
const { QUEUE_KEY } = await import("./queue-keys");

function mutation(overrides: Partial<OutboundMutation> = {}): OutboundMutation {
  return {
    mutationId: "m1",
    entityType: "visit_draft",
    entityId: "v1",
    operation: "update",
    rpcName: "update_visit_draft",
    payload: { clinical_note: "bright, no lameness" },
    baseServerVersion: 1,
    createdAt: "2026-10-20T08:00:00.000Z",
    attemptCount: 0,
    lastError: null,
    ...overrides
  };
}

let db: TestDatabase;

beforeEach(async () => {
  keychain.clear();
  openLocalDatabase.mockReset();
  getOrCreateDatabaseKey.mockClear();

  db = createTestDatabase();
  await migrate(db);
  openLocalDatabase.mockResolvedValue({ db, encrypted: false, schemaVersion: 1 });
});

describe("when the database opens", () => {
  it("reports the database as the backing", async () => {
    const storage = createLocalQueueStorage();
    const backing = await storage.backing();

    expect(backing.kind).toBe("database");
    if (backing.kind !== "database") throw new Error("unreachable");
    expect(backing.schemaVersion).toBe(1);
  });

  it("writes through to the database, not the keychain", async () => {
    const storage = createLocalQueueStorage();
    await storage.enqueue(mutation());

    const rows = await db.getAllAsync<{ mutation_id: string }>(
      "select mutation_id from outbound_mutations"
    );
    expect(rows).toEqual([{ mutation_id: "m1" }]);
    expect(keychain.has(QUEUE_KEY)).toBe(false);
  });

  it("opens once however many calls arrive together", async () => {
    const storage = createLocalQueueStorage();
    // The provider's first render fires several reads at once. Each opening its
    // own connection would also run adoption again.
    await Promise.all([
      storage.pendingCount(),
      storage.pending(),
      storage.deadLetters(),
      storage.backing()
    ]);

    expect(openLocalDatabase).toHaveBeenCalledTimes(1);
  });

  it("adopts what the keychain was holding, before the first count is read", async () => {
    keychain.set(QUEUE_KEY, JSON.stringify([mutation({ mutationId: "unsent-on-a-farm" })]));

    const storage = createLocalQueueStorage();
    // The very first thing the provider does. It must already include the
    // adopted work rather than jumping a moment later.
    expect(await storage.pendingCount()).toBe(1);

    expect((await storage.pending()).map((m) => m.mutationId)).toEqual(["unsent-on-a-farm"]);
    expect(keychain.has(QUEUE_KEY)).toBe(false);

    const backing = await storage.backing();
    if (backing.kind !== "database") throw new Error("unreachable");
    expect(backing.adopted).toMatchObject({ adopted: true, mutations: 1 });
  });

  it("does not ask for an encryption key while SQLCipher is off", async () => {
    // Asking would mint a key the database cannot use, and `pragma key` fails
    // on a build without the cipher compiled in.
    expect(SQLCIPHER_ENABLED).toBe(false);

    const storage = createLocalQueueStorage();
    await storage.backing();

    expect(getOrCreateDatabaseKey).not.toHaveBeenCalled();
  });

  it("passes the encrypted flag through as reported", async () => {
    openLocalDatabase.mockResolvedValue({ db, encrypted: true, schemaVersion: 1 });

    const backing = await createLocalQueueStorage().backing();
    if (backing.kind !== "database") throw new Error("unreachable");
    expect(backing.encrypted).toBe(true);
  });
});

describe("when the database will not open", () => {
  beforeEach(() => {
    openLocalDatabase.mockRejectedValue(new Error("disk image is malformed"));
  });

  it("falls back to the keychain rather than failing every call", async () => {
    const storage = createLocalQueueStorage();
    const backing = await storage.backing();

    expect(backing.kind).toBe("keychain");
    if (backing.kind !== "keychain") throw new Error("unreachable");
    expect(backing.reason).toContain("disk image is malformed");
  });

  it("still records a consultation", async () => {
    // A vet halfway through a visit does not care which file it lands in.
    const storage = createLocalQueueStorage();
    await storage.enqueue(mutation());

    expect(await storage.pendingCount()).toBe(1);
    expect(keychain.has(QUEUE_KEY)).toBe(true);
  });

  it("leaves the keychain's own queue in place to be adopted later", async () => {
    keychain.set(QUEUE_KEY, JSON.stringify([mutation({ mutationId: "earlier" })]));

    const storage = createLocalQueueStorage();
    await storage.enqueue(mutation({ mutationId: "during-the-outage" }));

    // Nothing was cleared, so the next successful open adopts both.
    const queued = JSON.parse(keychain.get(QUEUE_KEY)!) as OutboundMutation[];
    expect(queued.map((m) => m.mutationId).sort()).toEqual(["during-the-outage", "earlier"]);
  });

  it("recovers on the next launch and moves that work across", async () => {
    // The outage session.
    const failing = createLocalQueueStorage();
    await failing.enqueue(mutation({ mutationId: "written-while-broken" }));
    expect((await failing.backing()).kind).toBe("keychain");

    // Next launch: the database opens, and adoption is what joins the two.
    openLocalDatabase.mockResolvedValue({ db, encrypted: false, schemaVersion: 1 });
    const recovered = createLocalQueueStorage();

    expect((await recovered.pending()).map((m) => m.mutationId)).toEqual(["written-while-broken"]);
    expect(keychain.has(QUEUE_KEY)).toBe(false);
  });

  it("does not retry the open on every call", async () => {
    const storage = createLocalQueueStorage();
    await storage.pendingCount();
    await storage.pending();
    await storage.backing();

    // A corrupt database does not fix itself mid-session, and retrying would
    // make every write wait on the same failure again.
    expect(openLocalDatabase).toHaveBeenCalledTimes(1);
  });
});
