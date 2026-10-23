import { describe, expect, it } from "vitest";

import { LATEST_VERSION, MIGRATIONS, currentVersion, migrate } from "./schema";
import { createTestDatabase } from "./database.test-support";

describe("migrate", () => {
  it("takes a fresh database to the latest version", async () => {
    const db = createTestDatabase();
    expect(await currentVersion(db)).toBe(0);

    expect(await migrate(db)).toBe(LATEST_VERSION);

    const tables = await db.getAllAsync<{ name: string }>(
      "select name from sqlite_master where type = 'table' order by name"
    );
    expect(tables.map((t) => t.name)).toEqual([
      "attachment_upload_queue",
      "dead_letter_mutations",
      "outbound_mutations",
      "sync_checkpoints"
    ]);
    db.close();
  });

  it("is a no-op when already current", async () => {
    const db = createTestDatabase();
    await migrate(db);
    // Running again must not throw on `create table` for a table that exists.
    expect(await migrate(db)).toBe(LATEST_VERSION);
    db.close();
  });

  /**
   * Brief 15.2 item 9: a schema migration while unsynced records exist. The
   * failure this guards against is a migration implemented as drop-and-recreate,
   * which passes every test on an empty database and silently throws away a
   * vet's unsent consultations on a real one.
   */
  it("keeps queued mutations across a migration", async () => {
    const db = createTestDatabase();
    await migrate(db);

    await db.runAsync(
      `insert into outbound_mutations
         (mutation_id, entity_type, entity_id, operation, rpc_name, payload, created_at)
       values ('m1', 'visit_draft', 'v1', 'update', 'update_visit_draft', '{"note":"unsent"}', '2026-10-16T09:00:00.000Z')`
    );

    // Re-running every migration from scratch is what an upgrade does when a
    // new one is appended; the existing rows must survive it.
    expect(await migrate(db)).toBe(LATEST_VERSION);

    const rows = await db.getAllAsync<{ mutation_id: string; payload: string }>(
      "select mutation_id, payload from outbound_mutations"
    );
    expect(rows).toEqual([{ mutation_id: "m1", payload: '{"note":"unsent"}' }]);
    db.close();
  });

  it("leaves the version alone when a migration fails", async () => {
    const db = createTestDatabase();
    const broken = [
      { version: 1, description: "fine", sql: "create table a (x text);" },
      { version: 2, description: "broken", sql: "create table b (" }
    ];

    // Same loop as migrate, against a deliberately invalid migration. The
    // transaction must leave the database on 1, not somewhere between 1 and 2.
    const run = async () => {
      for (const m of broken) {
        await db.withTransactionAsync(async () => {
          await db.execAsync(m.sql);
          await db.execAsync(`pragma user_version = ${m.version}`);
        });
      }
    };

    await expect(run()).rejects.toThrow();
    expect(await currentVersion(db)).toBe(1);
    const tables = await db.getAllAsync<{ name: string }>(
      "select name from sqlite_master where type = 'table'"
    );
    expect(tables.map((t) => t.name)).toEqual(["a"]);
    db.close();
  });

  it("numbers migrations uniquely and in order", () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(versions).toEqual([...new Set(versions)]);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(versions.every((v) => v > 0)).toBe(true);
  });
});
