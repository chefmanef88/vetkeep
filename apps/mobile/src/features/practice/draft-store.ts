import { chunkedSecureStore } from "@/security/chunked-secure-store";
import type { DraftForm } from "./visit-types";

/**
 * Unsent typing, held on the device.
 *
 * This is deliberately *not* the sync queue. The queue holds work the vet has
 * decided to save and which is on its way to the server; this holds work in
 * progress that has not been saved at all. Losing it is the failure the queue
 * cannot protect against: a vet halfway through a consultation who backs out of
 * the screen to check a previous record, or whose phone is killed by Android to
 * reclaim memory while they are carrying it across a yard.
 *
 * Once a record is saved the queue owns it and the local copy is discarded, so
 * there is never a moment where two stores both claim to hold the truth.
 */

const PREFIX = "vetkeep.draft.";

export type StoredDraft = {
  form: DraftForm;
  savedAt: string;
  /**
   * The server version the typing was started from. If the server has moved on
   * since, the restored text may be answering a different question, and the vet
   * is told rather than the two being merged silently.
   */
  baseServerVersion: number;
};

/** SecureStore permits letters, digits, ".", "-" and "_"; a UUID satisfies it. */
function keyFor(visitId: string): string {
  return `${PREFIX}${visitId}`;
}

export async function loadDraft(visitId: string): Promise<StoredDraft | null> {
  const raw = await chunkedSecureStore.getItem(keyFor(visitId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredDraft;
    // A stored blob that is not a draft is treated as absent rather than
    // crashing the screen a vet is trying to write into.
    if (!parsed || typeof parsed !== "object" || !parsed.form) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveDraft(
  visitId: string,
  form: DraftForm,
  baseServerVersion: number
): Promise<void> {
  const payload: StoredDraft = {
    form,
    savedAt: new Date().toISOString(),
    baseServerVersion
  };
  await chunkedSecureStore.setItem(keyFor(visitId), JSON.stringify(payload));
}

export async function clearDraft(visitId: string): Promise<void> {
  await chunkedSecureStore.removeItem(keyFor(visitId));
}

/**
 * Whether restoring would actually change anything the vet can see.
 *
 * A draft identical to what the server already holds is not worth announcing;
 * telling someone their work was recovered when nothing was lost teaches them
 * to ignore the message.
 */
export function differsFrom(stored: DraftForm, server: DraftForm): boolean {
  return (Object.keys(server) as (keyof DraftForm)[]).some(
    (field) => (stored[field] ?? "") !== (server[field] ?? "")
  );
}
