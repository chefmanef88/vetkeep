/**
 * The local database schema, and the migration runner that reaches it.
 *
 * Tables are the ones brief section 15.4 requires, plus a dead-letter table the
 * queue has always had and the brief does not list. Migrations are numbered and
 * run in order against PRAGMA user_version, because section 15.2 item 9
 * requires a schema migration to survive unsynced records sitting in the
 * queue — so migrating must never be "drop and recreate".
 */

import type { SqliteDatabase } from "./types";

export interface Migration {
  version: number;
  /** What this does, for the log line when it runs on a vet's phone. */
  description: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: "sync queue, checkpoints and attachment uploads",
    sql: `
      create table outbound_mutations (
        mutation_id          text primary key,
        entity_type          text not null,
        entity_id            text not null,
        operation            text not null check (operation in ('create', 'update', 'delete')),
        rpc_name             text not null,
        payload              text not null,
        base_server_version  integer,
        created_at           text not null,
        attempt_count        integer not null default 0,
        last_error           text
      );

      -- claimBatch reads oldest-first and nothing else reads this table, so one
      -- index carries every query the queue makes.
      create index outbound_mutations_created_at on outbound_mutations (created_at, mutation_id);

      create table dead_letter_mutations (
        mutation_id  text primary key,
        mutation     text not null,
        reason       text not null,
        failed_at    text not null
      );

      create table sync_checkpoints (
        collection_name          text primary key,
        last_server_cursor       text,
        last_successful_sync_at  text
      );

      create table attachment_upload_queue (
        attachment_id   text primary key,
        local_file_uri  text not null,
        checksum        text not null,
        state           text not null,
        uploaded_bytes  integer not null default 0,
        attempt_count   integer not null default 0
      );
    `
  }
];

/** The version a fresh database is migrated to. */
export const LATEST_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);

interface UserVersionRow {
  user_version: number;
}

export async function currentVersion(db: SqliteDatabase): Promise<number> {
  const row = await db.getFirstAsync<UserVersionRow>("pragma user_version");
  return row?.user_version ?? 0;
}

/**
 * Applies every migration the database has not seen yet, in order.
 *
 * Each one runs inside a transaction together with the user_version bump, so a
 * migration that fails half way leaves the database on the version it started
 * on rather than somewhere between two. A phone loses power mid-migration more
 * often than a server does.
 */
export async function migrate(db: SqliteDatabase): Promise<number> {
  const from = await currentVersion(db);

  for (const migration of MIGRATIONS) {
    if (migration.version <= from) continue;

    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql);
      // Not parameterisable: pragma takes a literal.
      await db.execAsync(`pragma user_version = ${migration.version}`);
    });
  }

  return currentVersion(db);
}
