import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { AppState } from "react-native";
import { pushBatch, type EntityType, type OutboundMutation } from "@vetkeep/sync";
import { supabase } from "@/lib/supabase";
import { createQueueStorage, QueueAtCapacityError, type DeadLetterEntry } from "./queue-storage";
import { createSender } from "./send";

/**
 * Owns the outbound queue and the one sync loop.
 *
 * Every clinical write on mobile goes through `record` rather than calling the
 * RPC directly. When there is signal the difference is a few milliseconds; when
 * there is not, it is the difference between a consultation being saved and
 * being lost.
 */

type SyncStatus = "idle" | "syncing" | "offline" | "attention";

interface SyncContextValue {
  status: SyncStatus;
  pendingCount: number;
  conflicts: OutboundMutation[];
  deadLetters: DeadLetterEntry[];
  lastSyncAt: string | null;
  /** Queues a write and tries to send it now. Resolves once it is queued. */
  record: (input: RecordInput) => Promise<{ queued: true; sentNow: boolean }>;
  flush: () => Promise<void>;
  dismissDeadLetter: (mutationId: string) => Promise<void>;
}

export interface RecordInput {
  mutationId?: string;
  entityType: EntityType;
  entityId: string;
  operation: "create" | "update" | "delete";
  rpcName: string;
  payload: Record<string, unknown>;
  baseServerVersion?: number | null;
}

const SyncContext = createContext<SyncContextValue | null>(null);

/** Tables carrying a server_version the conflict screen can read back. */
const VERSIONED_TABLES: Partial<Record<EntityType, string>> = {
  client: "clients",
  patient: "patients",
  visit_draft: "visits",
  exam_finding: "physical_exam_findings"
};

export function SyncProvider({ children }: { children: ReactNode }) {
  const storage = useMemo(() => createQueueStorage(), []);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflicts, setConflicts] = useState<OutboundMutation[]>([]);
  const [deadLetters, setDeadLetters] = useState<DeadLetterEntry[]>([]);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const running = useRef(false);

  const sender = useMemo(
    () =>
      createSender({
        callRpc: async (rpcName, args) => {
          const { error } = await supabase.rpc(rpcName as never, args as never);
          return { error: error ? { code: error.code, message: error.message } : null };
        },
        readServerVersion: async (entityType, entityId) => {
          const table = VERSIONED_TABLES[entityType as EntityType];
          if (!table) return 0;
          const { data } = await supabase
            .from(table as never)
            .select("server_version")
            .eq("id", entityId)
            .maybeSingle();
          return (data as { server_version?: number } | null)?.server_version ?? 0;
        }
      }),
    []
  );

  const refreshCounts = useCallback(async () => {
    const [pending, dead] = await Promise.all([storage.pending(), storage.deadLetters()]);
    setPendingCount(pending.length);
    // A mutation that came back conflicted stays queued with the reason on it.
    setConflicts(pending.filter((mutation) => mutation.lastError !== null));
    setDeadLetters(dead);
  }, [storage]);

  const flush = useCallback(async () => {
    // One loop at a time. Two concurrent pushes would claim the same batch and
    // send every mutation twice; the server is idempotent, but the retry
    // counters would be wrong and the vet would see doubled progress.
    if (running.current) return;
    running.current = true;
    setStatus("syncing");

    try {
      const result = await pushBatch(storage, sender, { jitter: Math.random() });
      await refreshCounts();

      if (result.retrying > 0) setStatus("offline");
      else if (result.conflicted > 0 || result.deadLettered > 0) setStatus("attention");
      else {
        setStatus("idle");
        if (result.accepted > 0) setLastSyncAt(new Date().toISOString());
      }
    } catch {
      setStatus("offline");
    } finally {
      running.current = false;
    }
  }, [refreshCounts, sender, storage]);

  const record = useCallback<SyncContextValue["record"]>(
    async (input) => {
      const mutation: OutboundMutation = {
        mutationId: input.mutationId ?? globalThis.crypto.randomUUID(),
        entityType: input.entityType,
        entityId: input.entityId,
        operation: input.operation,
        rpcName: input.rpcName,
        payload: input.payload,
        baseServerVersion: input.baseServerVersion ?? null,
        createdAt: new Date().toISOString(),
        attemptCount: 0,
        lastError: null
      };

      try {
        await storage.enqueue(mutation);
      } catch (thrown: unknown) {
        // Capacity is the one enqueue failure the vet has to know about
        // immediately, because the alternative is losing the note they just
        // wrote without being told.
        if (thrown instanceof QueueAtCapacityError) throw thrown;
        throw thrown;
      }

      await refreshCounts();
      const before = await storage.pendingCount();
      await flush();
      const after = await storage.pendingCount();

      return { queued: true, sentNow: after < before };
    },
    [flush, refreshCounts, storage]
  );

  const dismissDeadLetter = useCallback(
    async (mutationId: string) => {
      await storage.clearDeadLetter(mutationId);
      await refreshCounts();
    },
    [refreshCounts, storage]
  );

  useEffect(() => {
    // Reads the queue that survived the last app launch. The rule guards against
    // cascading renders from a synchronous setState, which this is not: every
    // state update happens after the storage read resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshCounts();
  }, [refreshCounts]);

  useEffect(() => {
    // Coming back to the app is the moment a vet most often has signal again,
    // having walked out of a compound or back to the vehicle.
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void flush();
    });
    return () => subscription.remove();
  }, [flush]);

  const value = useMemo<SyncContextValue>(
    () => ({
      status,
      pendingCount,
      conflicts,
      deadLetters,
      lastSyncAt,
      record,
      flush,
      dismissDeadLetter
    }),
    [status, pendingCount, conflicts, deadLetters, lastSyncAt, record, flush, dismissDeadLetter]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useSync must be used inside SyncProvider");
  return context;
}
