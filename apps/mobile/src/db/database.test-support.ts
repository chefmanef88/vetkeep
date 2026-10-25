/**
 * A real SQLite database for the tests, from node's own built-in module.
 *
 * Not a hand-written fake. The things most worth testing here are the things a
 * fake would have to reimplement and would therefore get wrong: `on conflict`
 * upserts, the primary key refusing a duplicate idempotency key, rollback when
 * a transaction throws, `order by` with a tie-break, `sum(length(...))` over no
 * rows returning null. A fake that models all of that is a SQL engine, and
 * node ships one.
 *
 * It is not expo-sqlite, so it does not prove the native binding works — that
 * is what running on a phone is for. It proves the SQL and the storage logic.
 */

import { DatabaseSync } from "node:sqlite";

import type { SqliteDatabase, SqliteParam, SqliteRunResult } from "./types";

export interface TestDatabase extends SqliteDatabase {
  /** Closes the underlying handle. */
  close(): void;
}

export function createTestDatabase(path = ":memory:"): TestDatabase {
  const db = new DatabaseSync(path);

  // Matches what open.ts sets, so a constraint that only bites with foreign
  // keys enforced bites here too.
  db.exec("pragma foreign_keys = ON");

  // node:sqlite binds null, number and string; it rejects undefined, which is
  // what an optional field of OutboundMutation arrives as.
  const bind = (params: SqliteParam[] = []): (string | number | null)[] =>
    params.map((p) => (p === undefined ? null : p));

  let depth = 0;

  // Every method is `async` rather than returning Promise.resolve(...), so that
  // node:sqlite's synchronous throws become rejections. expo-sqlite rejects, and
  // an adapter that threw synchronously would make a test asserting a rejection
  // fail against code that is in fact correct — and worse, let real callers
  // pass here while their try/catch missed on a device.
  const database: TestDatabase = {
    async execAsync(sql) {
      db.exec(sql);
    },

    async runAsync(sql, params) {
      const result = db.prepare(sql).run(...bind(params));
      return {
        lastInsertRowId: Number(result.lastInsertRowid),
        changes: Number(result.changes)
      } satisfies SqliteRunResult;
    },

    async getAllAsync<T>(sql: string, params?: SqliteParam[]) {
      return db.prepare(sql).all(...bind(params)) as T[];
    },

    async getFirstAsync<T>(sql: string, params?: SqliteParam[]) {
      const row = db.prepare(sql).get(...bind(params));
      return (row ?? null) as T | null;
    },

    async withTransactionAsync(task) {
      // expo-sqlite nests these, and migrate() runs inside one while the
      // storage may open another, so a plain begin/commit would fail on the
      // inner one. Savepoints nest; a bare transaction does not.
      const name = `sp_${depth++}`;
      db.exec(depth === 1 ? "begin" : `savepoint ${name}`);
      try {
        await task();
        db.exec(depth === 1 ? "commit" : `release ${name}`);
      } catch (error) {
        db.exec(depth === 1 ? "rollback" : `rollback to ${name}`);
        throw error;
      } finally {
        depth--;
      }
    },

    close() {
      db.close();
    }
  };

  return database;
}
