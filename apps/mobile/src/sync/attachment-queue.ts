import type { AttachmentUpload } from "@vetkeep/sync";
import { chunkedSecureStore } from "@/security/chunked-secure-store";

/**
 * Durable record of uploads in flight, per brief 15.4.
 *
 * Only metadata lives here: identifiers, sizes, progress and the local file
 * URI. The image itself stays where the camera put it, so this queue is small
 * and stays well inside what the store can hold. It exists so that an app killed
 * mid-upload resumes rather than losing track of a photograph that has not
 * reached the server yet.
 */

const QUEUE_KEY = "vetkeep.attachments.uploads";

export interface QueuedUpload extends AttachmentUpload {
  patientId: string | null;
  visitId: string | null;
  /** What the vet sees while it is in flight. */
  label: string;
}

/**
 * A photograph of the animal itself rather than one attached to a consultation.
 *
 * Told apart by having no visit, which is what makes it a folder photograph in
 * the first place. Worth a named function rather than the check written out
 * four times: the one place it was implicit, the uploads were lost.
 */
export function isFolderPhoto(upload: QueuedUpload): boolean {
  return upload.visitId === null && upload.patientId !== null;
}

async function read(): Promise<QueuedUpload[]> {
  const raw = await chunkedSecureStore.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedUpload[];
  } catch {
    return [];
  }
}

async function write(queue: QueuedUpload[]): Promise<void> {
  await chunkedSecureStore.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export const attachmentQueue = {
  async all(): Promise<QueuedUpload[]> {
    return read();
  },

  async forVisit(visitId: string): Promise<QueuedUpload[]> {
    return (await read()).filter((upload) => upload.visitId === visitId);
  },

  async add(upload: QueuedUpload): Promise<void> {
    const queue = await read();
    // Adding the same attachment twice replaces rather than duplicates, so a
    // double tap on the shutter cannot produce two uploads of one photograph.
    const next = queue.filter((entry) => entry.attachmentId !== upload.attachmentId);
    next.push(upload);
    await write(next);
  },

  async update(upload: QueuedUpload): Promise<void> {
    const queue = await read();
    const index = queue.findIndex((entry) => entry.attachmentId === upload.attachmentId);
    if (index === -1) return;
    queue[index] = upload;
    await write(queue);
  },

  async remove(attachmentId: string): Promise<void> {
    const queue = await read();
    await write(queue.filter((entry) => entry.attachmentId !== attachmentId));
  },

  /** Uploads still needing work, oldest first. */
  async unfinished(): Promise<QueuedUpload[]> {
    return (await read()).filter((upload) => upload.state !== "uploaded");
  },

  /**
   * The photograph waiting to become this animal's folder picture, if any.
   *
   * Read by the folder so the vet sees the picture they just took while it is
   * still on the phone. Without it the only feedback is a line of text, and a
   * photograph taken with no signal looks like one that was not taken.
   */
  async folderPhotoFor(patientId: string): Promise<QueuedUpload | null> {
    const waiting = (await read()).filter(
      (upload) =>
        isFolderPhoto(upload) && upload.patientId === patientId && upload.state !== "uploaded"
    );
    // The most recent wins: taking another picture before the first has gone
    // means the second is the one the vet meant to keep.
    return waiting[waiting.length - 1] ?? null;
  }
};
