/**
 * Moving the queue that is already on a phone onto the local database.
 *
 * This runs once, on the update that introduces the database, and it matters
 * more than it looks. A veterinarian on a farm with no signal may be holding
 * days of unsent consultations in the keychain queue at the moment they take
 * this update. Losing them is losing clinical records that exist nowhere else
 * — the server has never seen them.
 *
 * So: read everything, write everything, and only then clear the keychain. If
 * any part fails, the keychain is left exactly as it was and the next launch
 * tries again. Adopting twice is harmless — the mutation id is the primary key,
 * so a re-run replaces rather than duplicates.
 */

import type { OutboundMutation, SyncCheckpoint } from "@vetkeep/sync";

import { chunkedSecureStore } from "@/security/chunked-secure-store";

import { CHECKPOINT_KEY, DEAD_KEY, QUEUE_KEY } from "./queue-keys";
import type { DeadLetterEntry, SqliteQueueStorage } from "./sqlite-queue-storage";

export interface AdoptionResult {
  mutations: number;
  deadLetters: number;
  checkpoints: number;
  /** False when there was nothing in the keychain, which is the common case. */
  adopted: boolean;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await chunkedSecureStore.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Unparseable means a write was interrupted part way. There is nothing to
    // recover and nothing to be gained by refusing to start, so this is where
    // that data ends — the same trade the keychain queue already made on read.
    return fallback;
  }
}

function looksLikeMutation(value: unknown): value is OutboundMutation {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<OutboundMutation>;
  return (
    typeof m.mutationId === "string" &&
    typeof m.entityType === "string" &&
    typeof m.entityId === "string" &&
    typeof m.rpcName === "string" &&
    (m.operation === "create" || m.operation === "update" || m.operation === "delete")
  );
}

/**
 * Copies the keychain queue into `storage`, then clears the keychain.
 *
 * Returns what moved, so the caller can say so rather than doing this silently
 * — a vet whose unsent work has just been migrated should be able to see that
 * the count survived.
 */
export async function adoptKeychainQueue(storage: SqliteQueueStorage): Promise<AdoptionResult> {
  const [mutations, deadLetters, checkpoints] = await Promise.all([
    readJson<unknown[]>(QUEUE_KEY, []),
    readJson<unknown[]>(DEAD_KEY, []),
    readJson<Record<string, SyncCheckpoint>>(CHECKPOINT_KEY, {})
  ]);

  const checkpointList = Object.values(checkpoints).filter(
    (c): c is SyncCheckpoint => !!c && typeof c.collectionName === "string"
  );

  if (mutations.length === 0 && deadLetters.length === 0 && checkpointList.length === 0) {
    return { mutations: 0, deadLetters: 0, checkpoints: 0, adopted: false };
  }

  // A row the queue cannot send is worse than no row: it would be retried
  // forever and could dead-letter ahead of real work. Anything malformed is
  // dropped here rather than written into the new queue.
  const usable = mutations.filter(looksLikeMutation);

  let moved = 0;
  for (const mutation of usable) {
    await storage.enqueue(mutation);
    moved++;
  }

  let movedDead = 0;
  for (const entry of deadLetters) {
    const candidate = entry as Partial<DeadLetterEntry>;
    if (!looksLikeMutation(candidate.mutation)) continue;
    // Goes in via the queue and straight out again, so the dead-letter row is
    // written by the same code path that writes every other one.
    await storage.enqueue(candidate.mutation);
    await storage.moveToDeadLetter(candidate.mutation, candidate.reason ?? "carried over");
    movedDead++;
  }

  for (const checkpoint of checkpointList) {
    await storage.writeCheckpoint(checkpoint);
  }

  // Only now. Everything above has to have succeeded for this line to run; if
  // it threw, the keychain still holds the work and the next launch retries.
  await Promise.all([
    chunkedSecureStore.removeItem(QUEUE_KEY),
    chunkedSecureStore.removeItem(DEAD_KEY),
    chunkedSecureStore.removeItem(CHECKPOINT_KEY)
  ]);

  return {
    mutations: moved,
    deadLetters: movedDead,
    checkpoints: checkpointList.length,
    adopted: true
  };
}
