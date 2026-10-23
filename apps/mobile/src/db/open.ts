/**
 * Opening the local database, and the one place encryption is decided.
 *
 * SQLCipher is a build-time choice in SDK 57: `useSQLCipher` in the expo-sqlite
 * plugin, then a prebuild. It is **not available in Expo Go**, which is the
 * only way this app is currently tested on a phone. So the encrypted and plain
 * paths both exist, the caller is told which one it got, and the app says so
 * rather than implying brief 5.1 is satisfied when it is not.
 *
 * Flipping to encrypted is: set `useSQLCipher` true in app.json, make a dev
 * build, and pass a key here. Nothing else in the app changes — which is the
 * reason this function exists instead of a bare openDatabaseAsync at a call
 * site.
 */

import * as SQLite from "expo-sqlite";

import { migrate } from "./schema";
import type { SqliteDatabase } from "./types";
import { RAW_KEY_PATTERN } from "./encryption-key";

export const DATABASE_NAME = "vetkeep.db";

export class DatabaseKeyRejected extends Error {
  constructor(cause: string) {
    super(`The local database did not open with the device key: ${cause}`);
    this.name = "DatabaseKeyRejected";
  }
}

export interface OpenedDatabase {
  db: SqliteDatabase;
  /**
   * Whether the file on disk is ciphertext. False in Expo Go, where SQLCipher
   * is not compiled in. Surfaced so the app can show it rather than assume it.
   */
  encrypted: boolean;
  schemaVersion: number;
}

export interface OpenOptions {
  /**
   * 64 hex characters from getOrCreateDatabaseKey, or null to open plain.
   *
   * Null is not a quiet fallback: it is what Expo Go has to pass, and callers
   * read `encrypted` back to find out what they got.
   */
  encryptionKey: string | null;
  /** Injected by the tests; defaults to the real expo-sqlite. */
  openDatabase?: (name: string) => Promise<SqliteDatabase>;
}

/**
 * SQLCipher takes a raw key as the literal `x'<hex>'` inside a quoted pragma.
 *
 * The hex form skips SQLCipher's passphrase key derivation, which is the right
 * choice for a key that was already generated at full strength, and it means
 * the value interpolated here cannot carry a quote. The pattern is checked
 * again rather than trusted from the caller, because this is the one string in
 * the app that goes into SQL unparameterised — a pragma cannot take a bound
 * parameter.
 */
function keyPragma(key: string): string {
  if (!RAW_KEY_PATTERN.test(key)) {
    throw new DatabaseKeyRejected("the key is not 64 hex characters");
  }
  return `pragma key = "x'${key}'"`;
}

export async function openLocalDatabase(options: OpenOptions): Promise<OpenedDatabase> {
  const open =
    options.openDatabase ??
    ((name: string) => SQLite.openDatabaseAsync(name) as unknown as Promise<SqliteDatabase>);

  const db = await open(DATABASE_NAME);
  const encrypted = options.encryptionKey !== null;

  if (options.encryptionKey !== null) {
    // Must be the first statement on the connection, before anything reads a
    // page. Nothing else may run above this line.
    await db.execAsync(keyPragma(options.encryptionKey));

    // A wrong key does not fail at `pragma key`; it fails on the first read,
    // because that is when a page has to be decrypted. Without this the app
    // would carry on and report a corrupt database later, somewhere unrelated.
    try {
      await db.getFirstAsync("select count(*) as n from sqlite_master");
    } catch (cause) {
      throw new DatabaseKeyRejected(cause instanceof Error ? cause.message : String(cause));
    }
  }

  // Keeps the queue durable across the power loss that section 15.2 item 3
  // tests for, without the full fsync cost of every write.
  await db.execAsync("pragma journal_mode = WAL");
  await db.execAsync("pragma foreign_keys = ON");

  const schemaVersion = await migrate(db);

  return { db, encrypted, schemaVersion };
}

/**
 * Removes the database file. Pairs with forgetDatabaseKey for the authenticated
 * logout and account-removal paths in 5.1.
 */
export async function deleteLocalDatabase(): Promise<void> {
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
}
