/**
 * The outbound queue, on the local database instead of the keychain.
 *
 * The keychain version works and is still there; what it cannot do is grow.
 * The chunked store can only hand back a bounded amount, so it refuses writes
 * past a ceiling — and brief 15.2 item 4 requires pushing and pulling at least
 * 10,000 records, which that ceiling makes impossible. That ceiling is the
 * reason section 15.2 asks for a local database at all.
 *
 * So there is no QueueAtCapacityError here. It is not that the error was
 * dropped; it is that the condition it reported cannot arise, which was the
 * point of moving.
 *
 * Encryption did not move to the application layer with it. The file is
 * ciphertext when SQLCipher is compiled in — see db/open.ts for why that is
 * not the case in Expo Go, and what it costs.
 */

import type { OutboundMutation, SyncCheckpoint } from "@vetkeep/sync";

import type { SqliteDatabase } from "@/db/types";

import type { DeadLetterEntry, QueueStorage } from "./queue-contract";

export type { DeadLetterEntry };

interface MutationRow {
  mutation_id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  rpc_name: string;
  payload: string;
  base_server_version: number | null;
  created_at: string;
  attempt_count: number;
  last_error: string | null;
}

interface DeadRow {
  mutation: string;
  reason: string;
  failed_at: string;
}

/**
 * A payload that will not parse is a row written by a build that is no longer
 * running, or a write interrupted part way. It cannot be sent and it cannot be
 * repaired here, so it comes back as an empty payload and fails on the server
 * with a real error rather than throwing inside a read and taking the whole
 * queue down with it. The keychain version made the same trade.
 */
function parsePayload(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function toMutation(row: MutationRow): OutboundMutation {
  return {
    mutationId: row.mutation_id,
    entityType: row.entity_type as OutboundMutation["entityType"],
    entityId: row.entity_id,
    operation: row.operation as OutboundMutation["operation"],
    rpcName: row.rpc_name,
    payload: parsePayload(row.payload),
    baseServerVersion: row.base_server_version,
    createdAt: row.created_at,
    attemptCount: row.attempt_count,
    lastError: row.last_error
  };
}

export type SqliteQueueStorage = QueueStorage;

export function createSqliteQueueStorage(db: SqliteDatabase): QueueStorage {
  return {
    async enqueue(mutation) {
      // Re-queuing the same mutation id replaces rather than duplicates: a
      // double tap on Save must not send the write twice. The idempotency key
      // is the primary key, so the database enforces that rather than a filter
      // in application code.
      //
      // attempt_count and last_error are deliberately reset. A replacement
      // carries different content, so the failures of what it replaced are not
      // its failures, and inheriting them could dead-letter it early.
      await db.runAsync(
        `insert into outbound_mutations
           (mutation_id, entity_type, entity_id, operation, rpc_name, payload,
            base_server_version, created_at, attempt_count, last_error)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict (mutation_id) do update set
           entity_type         = excluded.entity_type,
           entity_id           = excluded.entity_id,
           operation           = excluded.operation,
           rpc_name            = excluded.rpc_name,
           payload             = excluded.payload,
           base_server_version = excluded.base_server_version,
           attempt_count       = 0,
           last_error          = null`,
        [
          mutation.mutationId,
          mutation.entityType,
          mutation.entityId,
          mutation.operation,
          mutation.rpcName,
          JSON.stringify(mutation.payload),
          mutation.baseServerVersion,
          mutation.createdAt,
          mutation.attemptCount,
          mutation.lastError
        ]
      );
    },

    async claimBatch(limit) {
      if (limit <= 0) return [];
      // Oldest first: a consultation is documented in order, and applying a
      // later edit before an earlier one would resurrect stale text. created_at
      // can tie when two writes land in the same millisecond, so mutation_id
      // breaks it and the order is total rather than merely mostly-stable.
      const rows = await db.getAllAsync<MutationRow>(
        `select * from outbound_mutations
          order by created_at asc, mutation_id asc
          limit ?`,
        [limit]
      );
      return rows.map(toMutation);
    },

    async remove(mutationId) {
      await db.runAsync("delete from outbound_mutations where mutation_id = ?", [mutationId]);
    },

    async update(mutation) {
      // Only the retry bookkeeping. The engine calls this to record an attempt,
      // never to change what is being sent, and a write that silently rewrote
      // the payload would make the idempotency key a lie.
      await db.runAsync(
        `update outbound_mutations
            set attempt_count = ?, last_error = ?
          where mutation_id = ?`,
        [mutation.attemptCount, mutation.lastError, mutation.mutationId]
      );
    },

    async moveToDeadLetter(mutation, reason) {
      // One transaction. A mutation that was inserted into the dead letters but
      // not deleted from the queue would be sent again after having been given
      // up on; deleted but not inserted, and the vet's unsent work disappears
      // with nothing to show them.
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `insert into dead_letter_mutations (mutation_id, mutation, reason, failed_at)
           values (?, ?, ?, ?)
           on conflict (mutation_id) do update set
             mutation  = excluded.mutation,
             reason    = excluded.reason,
             failed_at = excluded.failed_at`,
          [mutation.mutationId, JSON.stringify(mutation), reason, new Date().toISOString()]
        );
        await db.runAsync("delete from outbound_mutations where mutation_id = ?", [
          mutation.mutationId
        ]);
      });
    },

    async readCheckpoint(collectionName) {
      const row = await db.getFirstAsync<{
        collection_name: string;
        last_server_cursor: string | null;
        last_successful_sync_at: string | null;
      }>("select * from sync_checkpoints where collection_name = ?", [collectionName]);
      if (!row) return null;
      return {
        collectionName: row.collection_name,
        lastServerCursor: row.last_server_cursor,
        lastSuccessfulSyncAt: row.last_successful_sync_at
      };
    },

    async writeCheckpoint(checkpoint: SyncCheckpoint) {
      await db.runAsync(
        `insert into sync_checkpoints
           (collection_name, last_server_cursor, last_successful_sync_at)
         values (?, ?, ?)
         on conflict (collection_name) do update set
           last_server_cursor      = excluded.last_server_cursor,
           last_successful_sync_at = excluded.last_successful_sync_at`,
        [checkpoint.collectionName, checkpoint.lastServerCursor, checkpoint.lastSuccessfulSyncAt]
      );
    },

    async pendingCount() {
      const row = await db.getFirstAsync<{ n: number }>(
        "select count(*) as n from outbound_mutations"
      );
      return row?.n ?? 0;
    },

    async pending() {
      const rows = await db.getAllAsync<MutationRow>(
        "select * from outbound_mutations order by created_at asc, mutation_id asc"
      );
      return rows.map(toMutation);
    },

    async deadLetters() {
      const rows = await db.getAllAsync<DeadRow>(
        "select mutation, reason, failed_at from dead_letter_mutations order by failed_at asc"
      );
      return rows.map((row) => ({
        mutation: JSON.parse(row.mutation) as OutboundMutation,
        reason: row.reason,
        failedAt: row.failed_at
      }));
    },

    async usedBytes() {
      // Diagnostics only now that nothing is rationed, so the sync screen can
      // still say how much is waiting.
      const row = await db.getFirstAsync<{ n: number | null }>(
        "select sum(length(payload)) as n from outbound_mutations"
      );
      return row?.n ?? 0;
    },

    async clearDeadLetter(mutationId) {
      await db.runAsync("delete from dead_letter_mutations where mutation_id = ?", [mutationId]);
    }
  };
}
