/**
 * The queue the provider actually talks to.
 *
 * Opening SQLite is asynchronous and the provider builds its storage during
 * render, so something has to bridge the two. This does: every method is
 * already async, so each one awaits the open and then delegates, and no call
 * site has to know that the first write of a session may wait a few
 * milliseconds for a file to open.
 *
 * It also decides what happens when the database cannot be opened at all — a
 * corrupt file, a full disk, a platform that refused. The answer is not to let
 * the app stop recording. A veterinarian halfway through a consultation on a
 * farm does not care which file their note lands in; they care that tapping
 * Save keeps it. So the keychain queue stays as the fallback: smaller, capped,
 * but there.
 *
 * That cannot split the data in two, because adoption is idempotent and runs on
 * every successful open. Work written to the keychain during a session when the
 * database would not open is picked up and moved the next time it does, and the
 * mutation id is the primary key, so a mutation that somehow exists in both
 * ends up as one row.
 */

import { openLocalDatabase } from "@/db/open";
import { getOrCreateDatabaseKey } from "@/db/encryption-key";

import { adoptKeychainQueue, type AdoptionResult } from "./queue-adoption";
import type { QueueStorage } from "./queue-contract";
import { createQueueStorage } from "./queue-storage";
import { createSqliteQueueStorage } from "./sqlite-queue-storage";

/** Whether SQLCipher is compiled in. False under Expo Go; see db/open.ts. */
export type Backing =
  | {
      kind: "database";
      /** False means the file on disk is readable plaintext. */
      encrypted: boolean;
      schemaVersion: number;
      adopted: AdoptionResult;
    }
  | {
      kind: "keychain";
      /** Why the database could not be used, for the sync screen to show. */
      reason: string;
    };

export interface LocalQueueStorage extends QueueStorage {
  /** Resolves once the backing is decided. Safe to call repeatedly. */
  backing(): Promise<Backing>;
}

interface Opened {
  storage: QueueStorage;
  backing: Backing;
}

/**
 * Whether to ask for an encryption key at all.
 *
 * SQLCipher is a build-time flag and is absent from Expo Go, so asking for a
 * key there would produce one the database cannot use, and `pragma key` would
 * fail on a build without the cipher compiled in. Driven by the same flag as
 * app.json rather than guessed at runtime: there is no way to ask expo-sqlite
 * whether it was built with SQLCipher.
 *
 * Flip this and `useSQLCipher` in app.json together, in a dev build.
 */
export const SQLCIPHER_ENABLED = false;

async function open(): Promise<Opened> {
  const encryptionKey = SQLCIPHER_ENABLED ? await getOrCreateDatabaseKey() : null;
  const { db, encrypted, schemaVersion } = await openLocalDatabase({ encryptionKey });

  const storage = createSqliteQueueStorage(db);

  // Before the provider reads a count, so the first thing a vet sees already
  // includes whatever came over from the keychain.
  const adopted = await adoptKeychainQueue(storage);

  return { storage, backing: { kind: "database", encrypted, schemaVersion, adopted } };
}

export function createLocalQueueStorage(): LocalQueueStorage {
  // One open per storage instance, shared by every method. Without this, the
  // provider's first render fires several reads at once and each would open
  // its own connection and run adoption again.
  let opening: Promise<Opened> | null = null;

  function ready(): Promise<Opened> {
    opening ??= open().catch((thrown: unknown) => {
      const reason = thrown instanceof Error ? thrown.message : String(thrown);
      // Not rethrown. A queue that throws on every call is an app that cannot
      // record anything, which is worse than a capped one.
      return {
        storage: createQueueStorage(),
        backing: { kind: "keychain", reason }
      } satisfies Opened;
    });
    return opening;
  }

  return {
    async backing() {
      return (await ready()).backing;
    },

    async enqueue(mutation) {
      return (await ready()).storage.enqueue(mutation);
    },
    async claimBatch(limit) {
      return (await ready()).storage.claimBatch(limit);
    },
    async remove(mutationId) {
      return (await ready()).storage.remove(mutationId);
    },
    async update(mutation) {
      return (await ready()).storage.update(mutation);
    },
    async moveToDeadLetter(mutation, reason) {
      return (await ready()).storage.moveToDeadLetter(mutation, reason);
    },
    async readCheckpoint(collectionName) {
      return (await ready()).storage.readCheckpoint(collectionName);
    },
    async writeCheckpoint(checkpoint) {
      return (await ready()).storage.writeCheckpoint(checkpoint);
    },
    async pendingCount() {
      return (await ready()).storage.pendingCount();
    },
    async pending() {
      return (await ready()).storage.pending();
    },
    async deadLetters() {
      return (await ready()).storage.deadLetters();
    },
    async usedBytes() {
      return (await ready()).storage.usedBytes();
    },
    async clearDeadLetter(mutationId) {
      return (await ready()).storage.clearDeadLetter(mutationId);
    }
  };
}
