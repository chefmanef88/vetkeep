import { nextRetryDelayMs, shouldDeadLetter } from "./backoff";
import { conflictPolicyFor, discardsLocalChange } from "./conflict";
import type { OutboundMutation, PushResponse, SyncOutcome, SyncStorage } from "./types";

/**
 * Decides what happens to one mutation given what the server said.
 *
 * Pure on purpose. The interesting behaviour of a sync engine is its decision
 * table, and a decision table that needs a database and a network to exercise is
 * a decision table nobody tests properly.
 */
export function decideOutcome(
  mutation: OutboundMutation,
  response: PushResponse,
  options: { jitter?: number; maxAttempts?: number } = {}
): SyncOutcome {
  const { jitter = 0, maxAttempts } = options;

  switch (response.status) {
    case "accepted":
      return { kind: "accepted", serverVersion: response.serverVersion };

    case "stale": {
      // Another device changed this record first. What happens next depends
      // entirely on what kind of record it is.
      const policy = conflictPolicyFor(mutation.entityType);
      return {
        kind: "conflict",
        policy,
        serverVersion: response.serverVersion,
        reason: response.message
      };
    }

    case "unavailable": {
      // The network failed, not the write. Retrying the same mutation is safe
      // because the id makes it idempotent.
      const attempts = mutation.attemptCount + 1;
      if (shouldDeadLetter(attempts, maxAttempts)) {
        return { kind: "dead_letter", reason: response.message };
      }
      return {
        kind: "retry",
        afterMs: nextRetryDelayMs(attempts, jitter),
        reason: response.message
      };
    }

    case "rejected":
      // The server refused on its own terms: a bad state transition, a revoked
      // device, a validation failure. Retrying cannot help, and the mutation
      // must stay visible rather than vanish.
      return { kind: "dead_letter", reason: `${response.code}: ${response.message}` };
  }
}

/**
 * Applies an outcome to storage.
 *
 * Returns the mutations that now need the vet's attention, so the caller can
 * surface a conflict screen rather than resolving a clinical disagreement on
 * its own.
 */
export async function applyOutcome(
  storage: SyncStorage,
  mutation: OutboundMutation,
  outcome: SyncOutcome
): Promise<{ needsAttention: boolean }> {
  switch (outcome.kind) {
    case "accepted":
      await storage.remove(mutation.mutationId);
      return { needsAttention: false };

    case "conflict": {
      if (discardsLocalChange(outcome.policy)) {
        // Either the server already applied this exact mutation, or the record
        // is immutable and the edit was never permissible. Neither is something
        // the vet can act on, so the queue entry goes rather than nagging.
        await storage.remove(mutation.mutationId);
        return { needsAttention: false };
      }
      await storage.update({
        ...mutation,
        attemptCount: mutation.attemptCount + 1,
        lastError: outcome.reason
      });
      return { needsAttention: true };
    }

    case "retry":
      await storage.update({
        ...mutation,
        attemptCount: mutation.attemptCount + 1,
        lastError: outcome.reason
      });
      return { needsAttention: false };

    case "dead_letter":
      await storage.moveToDeadLetter(mutation, outcome.reason);
      return { needsAttention: true };
  }
}

export interface PushResult {
  pushed: number;
  accepted: number;
  conflicted: number;
  retrying: number;
  deadLettered: number;
}

/**
 * Pushes one bounded batch.
 *
 * Bounded because section 15.5 requires backpressure: a device that has been
 * offline for a week must not try to send the week in one request. Processing
 * stops at the first transport failure, since continuing would burn the retry
 * budget of every remaining mutation on the same dead connection.
 */
export async function pushBatch(
  storage: SyncStorage,
  send: (mutation: OutboundMutation) => Promise<PushResponse>,
  options: { batchSize?: number; jitter?: number; maxAttempts?: number } = {}
): Promise<PushResult> {
  const { batchSize = 25, jitter = 0, maxAttempts } = options;
  const batch = await storage.claimBatch(batchSize);

  const result: PushResult = {
    pushed: 0,
    accepted: 0,
    conflicted: 0,
    retrying: 0,
    deadLettered: 0
  };

  for (const mutation of batch) {
    const response = await send(mutation);
    const outcome = decideOutcome(mutation, response, {
      jitter,
      ...(maxAttempts === undefined ? {} : { maxAttempts })
    });
    await applyOutcome(storage, mutation, outcome);
    result.pushed += 1;

    if (outcome.kind === "accepted") result.accepted += 1;
    if (outcome.kind === "conflict") result.conflicted += 1;
    if (outcome.kind === "dead_letter") result.deadLettered += 1;
    if (outcome.kind === "retry") {
      result.retrying += 1;
      // The connection is down. Everything after this would fail the same way.
      break;
    }
  }

  return result;
}

/**
 * Advances a checkpoint only after the caller confirms the pulled page was
 * applied.
 *
 * Section 15.5 is explicit that the checkpoint moves after the local
 * transaction succeeds, never before. Advancing first and then failing to apply
 * would skip records permanently: the next pull asks for changes after a cursor
 * whose data never landed.
 */
export async function advanceCheckpoint(
  storage: SyncStorage,
  collectionName: string,
  cursor: string,
  applied: boolean,
  now: () => string = () => new Date().toISOString()
): Promise<boolean> {
  if (!applied) return false;
  await storage.writeCheckpoint({
    collectionName,
    lastServerCursor: cursor,
    lastSuccessfulSyncAt: now()
  });
  return true;
}
