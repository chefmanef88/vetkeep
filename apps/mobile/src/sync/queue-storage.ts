import type { OutboundMutation, SyncCheckpoint, SyncStorage } from "@vetkeep/sync";
import { MAX_VALUE_LENGTH, chunkedSecureStore } from "@/security/chunked-secure-store";

/**
 * Durable storage for the outbound queue.
 *
 * A queued mutation holds the consultation note the vet just wrote, so it is
 * clinical data sitting on a phone that may be lost or stolen. Brief 5.1
 * requires local clinical data to be encrypted, which rules out a plain JSON
 * file in the documents directory. This goes through the OS keychain and
 * keystore instead, where the platform holds the key.
 *
 * The ceiling is real and deliberate. The keychain is not a database and the
 * chunked store can read back a bounded amount, so the queue reports pressure
 * and refuses to grow past what it can hand back rather than accepting a write
 * it could never return. Removing that ceiling is one of the things the local
 * database chosen in the brief's section 15.2 evaluation is for.
 */

const QUEUE_KEY = "vetkeep.sync.outbound";
const DEAD_KEY = "vetkeep.sync.dead_letter";
const CHECKPOINT_KEY = "vetkeep.sync.checkpoints";

/** Leaves room for the envelope so a queue at capacity can still be rewritten. */
export const QUEUE_CAPACITY_BYTES = Math.floor(MAX_VALUE_LENGTH * 0.9);

export interface DeadLetterEntry {
  mutation: OutboundMutation;
  reason: string;
  failedAt: string;
}

export class QueueAtCapacityError extends Error {
  constructor() {
    super(
      "This device is holding as much unsent work as it can. Connect to the internet to send it before recording more."
    );
    this.name = "QueueAtCapacityError";
  }
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await chunkedSecureStore.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Unparseable means the store was interrupted mid-write. Returning the
    // fallback loses less than throwing on every subsequent read would.
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await chunkedSecureStore.setItem(key, JSON.stringify(value));
}

export function createQueueStorage(): SyncStorage & {
  pendingCount(): Promise<number>;
  pending(): Promise<OutboundMutation[]>;
  deadLetters(): Promise<DeadLetterEntry[]>;
  usedBytes(): Promise<number>;
  clearDeadLetter(mutationId: string): Promise<void>;
} {
  async function readQueue(): Promise<OutboundMutation[]> {
    return readJson<OutboundMutation[]>(QUEUE_KEY, []);
  }

  async function writeQueue(queue: OutboundMutation[]): Promise<void> {
    const encoded = JSON.stringify(queue);
    if (encoded.length > QUEUE_CAPACITY_BYTES) throw new QueueAtCapacityError();
    await chunkedSecureStore.setItem(QUEUE_KEY, encoded);
  }

  return {
    async enqueue(mutation) {
      const queue = await readQueue();
      // Re-queuing the same mutation id replaces rather than duplicates. A
      // double tap on Save must not send the write twice.
      const next = queue.filter((entry) => entry.mutationId !== mutation.mutationId);
      next.push(mutation);
      await writeQueue(next);
    },

    async claimBatch(limit) {
      const queue = await readQueue();
      // Oldest first: a consultation is documented in order, and applying a
      // later edit before an earlier one would resurrect stale text.
      return queue.slice(0, Math.max(0, limit));
    },

    async remove(mutationId) {
      const queue = await readQueue();
      await writeQueue(queue.filter((entry) => entry.mutationId !== mutationId));
    },

    async update(mutation) {
      const queue = await readQueue();
      const index = queue.findIndex((entry) => entry.mutationId === mutation.mutationId);
      if (index === -1) return;
      queue[index] = mutation;
      await writeQueue(queue);
    },

    async moveToDeadLetter(mutation, reason) {
      const [queue, dead] = await Promise.all([
        readQueue(),
        readJson<DeadLetterEntry[]>(DEAD_KEY, [])
      ]);
      dead.push({ mutation, reason, failedAt: new Date().toISOString() });
      await writeJson(DEAD_KEY, dead);
      await writeQueue(queue.filter((entry) => entry.mutationId !== mutation.mutationId));
    },

    async readCheckpoint(collectionName) {
      const all = await readJson<Record<string, SyncCheckpoint>>(CHECKPOINT_KEY, {});
      return all[collectionName] ?? null;
    },

    async writeCheckpoint(checkpoint) {
      const all = await readJson<Record<string, SyncCheckpoint>>(CHECKPOINT_KEY, {});
      all[checkpoint.collectionName] = checkpoint;
      await writeJson(CHECKPOINT_KEY, all);
    },

    async pendingCount() {
      return (await readQueue()).length;
    },

    async pending() {
      return readQueue();
    },

    async deadLetters() {
      return readJson<DeadLetterEntry[]>(DEAD_KEY, []);
    },

    async usedBytes() {
      return JSON.stringify(await readQueue()).length;
    },

    async clearDeadLetter(mutationId) {
      const dead = await readJson<DeadLetterEntry[]>(DEAD_KEY, []);
      await writeJson(
        DEAD_KEY,
        dead.filter((entry) => entry.mutation.mutationId !== mutationId)
      );
    }
  };
}
