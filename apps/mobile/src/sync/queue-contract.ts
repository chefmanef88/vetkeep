/**
 * What the provider needs from a queue, whichever thing is holding it.
 *
 * There are two implementations: the keychain one that shipped, and the local
 * database one that replaces it. They were growing their own copies of this
 * shape, which is how two implementations of the same thing quietly stop
 * matching. Declared once here instead, with no imports, so either side can
 * depend on it without dragging the other along.
 */

import type { OutboundMutation, SyncStorage } from "@vetkeep/sync";

export interface DeadLetterEntry {
  mutation: OutboundMutation;
  reason: string;
  failedAt: string;
}

export interface QueueStorage extends SyncStorage {
  pendingCount(): Promise<number>;
  pending(): Promise<OutboundMutation[]>;
  deadLetters(): Promise<DeadLetterEntry[]>;
  /** Bytes of queued payload. Diagnostics only once nothing is rationed. */
  usedBytes(): Promise<number>;
  clearDeadLetter(mutationId: string): Promise<void>;
}
