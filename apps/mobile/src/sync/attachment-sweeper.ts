import { supabase } from "@/lib/supabase";

import { attachmentQueue, isFolderPhoto, type QueuedUpload } from "./attachment-queue";
import { advanceUpload, releaseLocalCopyIfSafe } from "./attachment-uploader";

/**
 * Drains the attachment queue, whatever screen is open.
 *
 * Nothing used to. The only driver was the attachments section of a
 * consultation, which looks its work up by visit — so a folder photograph,
 * which deliberately belongs to the animal rather than to any one consultation
 * and is therefore queued with no visit, could never be found by it. The bytes
 * sat in the queue and were never sent, online or offline, and no amount of
 * retrying helped because retrying queued another one nothing would collect
 * either.
 *
 * It also fixes the narrower thing it looks like: leaving a consultation while
 * a photograph is still uploading used to abandon it until the vet happened to
 * open that same consultation again.
 *
 * Driven from the sync provider's flush, so attachments drain on the same
 * occasions clinical writes do — when the app comes back to the foreground,
 * which is the moment a vet most often has signal again.
 */

/** One upload at a time, and a bounded number per sweep. */
const MAX_STEPS = 6;

async function drive(upload: QueuedUpload): Promise<QueuedUpload> {
  let current: QueuedUpload = upload;

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const next = await advanceUpload(current, {
      patientId: current.patientId,
      visitId: current.visitId
    });
    current = { ...current, ...next };
    // Persisted between steps, so an app killed mid-upload resumes from what
    // was written down rather than starting again.
    await attachmentQueue.update(current);
    if (next.state === "uploaded" || next.state === "failed") break;
  }

  return current;
}

/**
 * Points the animal at its new photograph, once the bytes are actually there.
 *
 * This used to be called the moment the picture was taken, which is why taking
 * one with no signal failed outright: the server cannot be told to use an
 * attachment it has never heard of. Doing it here instead means the record
 * points at a photograph that exists.
 */
async function pointFolderAtPhoto(upload: QueuedUpload): Promise<void> {
  if (!upload.patientId) return;
  await supabase.rpc("set_patient_photo", {
    p_patient_id: upload.patientId,
    p_attachment_id: upload.attachmentId
  });
}

export interface SweepResult {
  attempted: number;
  uploaded: number;
}

export async function sweepAttachments(): Promise<SweepResult> {
  const waiting = await attachmentQueue.unfinished();
  if (waiting.length === 0) return { attempted: 0, uploaded: 0 };

  let uploaded = 0;

  for (const upload of waiting) {
    const finished = await drive(upload);
    if (finished.state !== "uploaded") continue;

    uploaded += 1;
    if (isFolderPhoto(finished)) await pointFolderAtPhoto(finished);
    // Only once the server has confirmed it. Until then this is the only copy.
    await releaseLocalCopyIfSafe(finished);
  }

  return { attempted: waiting.length, uploaded };
}
