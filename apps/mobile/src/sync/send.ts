import { CODE_TAKEN, CODE_TAKEN_MESSAGE, isCodeCollision } from "@vetkeep/domain";
import type { OutboundMutation, PushResponse } from "@vetkeep/sync";

/**
 * Maps what PostgREST returned onto what the sync engine understands.
 *
 * This is where a wrong answer is expensive. Classifying a network blip as a
 * rejection dead-letters a consultation the vet did write; classifying a real
 * rejection as a network blip retries it eight times and then dead-letters it
 * anyway, having hidden the actual reason for several minutes.
 */

/** The shape supabase-js hands back on a failed rpc call. */
export interface RpcError {
  code?: string | undefined;
  message: string;
  details?: string | null | undefined;
}

/** PostgreSQL serialization_failure, raised by app_private.assert_fresh. */
export const STALE_WRITE_CODE = "40001";

/**
 * Errors that mean "the request never reached the database", so the write is
 * still worth retrying. supabase-js surfaces transport failures as a TypeError
 * from fetch with no PostgreSQL code attached.
 */
function isTransportFailure(error: RpcError): boolean {
  if (error.code) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("network request failed") ||
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("connection")
  );
}

export function classifyRpcError(error: RpcError, serverVersion: number): PushResponse {
  if (error.code === STALE_WRITE_CODE) {
    return { status: "stale", serverVersion, message: error.message };
  }

  if (isTransportFailure(error)) {
    return { status: "unavailable", message: error.message };
  }

  // A repeated code is the one rejection that would succeed if sent again,
  // because the remedy is a different code. It is still not retried here: by
  // the time a queued write reaches the server the vet may already have handed
  // that reference to the client, and swapping it silently would leave the
  // paper in their hand pointing at nothing. So it dead-letters like the rest,
  // but carrying a code the sync screen can offer a remedy for, and a sentence
  // a person can read instead of the constraint name.
  if (isCodeCollision(error)) {
    return { status: "rejected", code: CODE_TAKEN, message: CODE_TAKEN_MESSAGE };
  }

  // Everything else is the server refusing on its own terms: a revoked device,
  // a suspended account, a validation failure, a disallowed state transition.
  // None of those improve by being sent again.
  return { status: "rejected", code: error.code ?? "unknown", message: error.message };
}

export interface SenderDependencies {
  /** Calls the controlled RPC named by the mutation. */
  callRpc: (rpcName: string, args: Record<string, unknown>) => Promise<{ error: RpcError | null }>;
  /**
   * Reads the record's current server_version. Used only on a stale write, so
   * the conflict screen can show the vet what the server actually holds rather
   * than a version parsed out of an error string.
   */
  readServerVersion: (entityType: string, entityId: string) => Promise<number>;
}

export function createSender(deps: SenderDependencies) {
  return async function send(mutation: OutboundMutation): Promise<PushResponse> {
    let result: { error: RpcError | null };

    try {
      result = await deps.callRpc(mutation.rpcName, mutation.payload);
    } catch (thrown: unknown) {
      // A thrown error rather than a returned one is almost always the network.
      const message = thrown instanceof Error ? thrown.message : "Request failed";
      return { status: "unavailable", message };
    }

    if (!result.error) {
      // The version the record now holds is one past what we based the edit on.
      // Creates carry no base version and are not versioned by this path.
      return { status: "accepted", serverVersion: (mutation.baseServerVersion ?? 0) + 1 };
    }

    if (result.error.code === STALE_WRITE_CODE) {
      let current = mutation.baseServerVersion ?? 0;
      try {
        current = await deps.readServerVersion(mutation.entityType, mutation.entityId);
      } catch {
        // If the follow-up read also fails the conflict is still real; the
        // screen just shows a less precise version.
      }
      return { status: "stale", serverVersion: current, message: result.error.message };
    }

    return classifyRpcError(result.error, mutation.baseServerVersion ?? 0);
  };
}
