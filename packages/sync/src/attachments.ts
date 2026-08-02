import { nextRetryDelayMs, shouldDeadLetter } from "./backoff";

/**
 * Resumable attachment uploads, per brief 15.4 and 7.6.
 *
 * A photograph of a wound taken in someone's yard exists in exactly one place
 * until the server confirms it has the bytes and their checksum. Every rule here
 * follows from that: the device is the last to let go, not the first.
 */

export type UploadState = "pending" | "registered" | "uploading" | "uploaded" | "failed";

export interface AttachmentUpload {
  attachmentId: string;
  /** Where the file sits on this device. The only copy until confirmation. */
  localUri: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** Assigned by the server at registration; the client never picks a path. */
  storagePath: string | null;
  /** How much has been transferred, so an interrupted upload resumes. */
  uploadedBytes: number;
  checksum: string | null;
  state: UploadState;
  attemptCount: number;
  lastError: string | null;
}

export type UploadAction =
  | { kind: "register" }
  | { kind: "upload"; fromByte: number }
  | { kind: "confirm"; checksum: string }
  | { kind: "wait"; afterMs: number }
  | { kind: "abandon"; reason: string }
  | { kind: "done" };

export const MAX_UPLOAD_ATTEMPTS = 6;

/**
 * The single most important rule in this file.
 *
 * The local copy is released only once the server holds the bytes and has
 * agreed the checksum. Anything earlier, including "the upload call returned",
 * risks deleting the only copy of a clinical image.
 */
export function canDeleteLocalFile(upload: AttachmentUpload): boolean {
  return upload.state === "uploaded" && upload.checksum !== null;
}

/** What this upload should do next. */
export function nextUploadAction(upload: AttachmentUpload): UploadAction {
  if (upload.state === "uploaded") return { kind: "done" };

  if (shouldDeadLetter(upload.attemptCount, MAX_UPLOAD_ATTEMPTS)) {
    // Abandoned means "stop trying", never "delete". The file stays on the
    // device and the attachment stays visible as failed.
    return { kind: "abandon", reason: upload.lastError ?? "Upload failed too many times" };
  }

  if (upload.state === "failed") {
    return { kind: "wait", afterMs: nextRetryDelayMs(upload.attemptCount) };
  }

  if (upload.storagePath === null) return { kind: "register" };

  if (upload.uploadedBytes < upload.sizeBytes) {
    // Resume from where the last attempt stopped rather than restarting. On a
    // slow connection a restart can mean the upload never completes at all.
    return { kind: "upload", fromByte: upload.uploadedBytes };
  }

  if (upload.checksum === null) {
    // All bytes are across but nothing has been agreed. Without a checksum the
    // server cannot say the file is intact, so this is not finished.
    return { kind: "upload", fromByte: upload.uploadedBytes };
  }

  return { kind: "confirm", checksum: upload.checksum };
}

export type UploadEvent =
  | { kind: "registered"; storagePath: string }
  | { kind: "progress"; uploadedBytes: number }
  | { kind: "transferred"; checksum: string }
  | { kind: "confirmed" }
  | { kind: "failed"; reason: string };

export function applyUploadEvent(upload: AttachmentUpload, event: UploadEvent): AttachmentUpload {
  switch (event.kind) {
    case "registered":
      return { ...upload, storagePath: event.storagePath, state: "registered", lastError: null };

    case "progress":
      return {
        ...upload,
        // Never move backwards: a retried chunk reporting an older offset would
        // otherwise undo real progress.
        uploadedBytes: Math.min(
          upload.sizeBytes,
          Math.max(upload.uploadedBytes, event.uploadedBytes)
        ),
        state: "uploading",
        lastError: null
      };

    case "transferred":
      return {
        ...upload,
        uploadedBytes: upload.sizeBytes,
        checksum: event.checksum,
        state: "uploading",
        lastError: null
      };

    case "confirmed":
      return { ...upload, state: "uploaded", lastError: null };

    case "failed":
      return {
        ...upload,
        state: "failed",
        attemptCount: upload.attemptCount + 1,
        lastError: event.reason
      };
  }
}

export function createUpload(input: {
  attachmentId: string;
  localUri: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): AttachmentUpload {
  return {
    ...input,
    storagePath: null,
    uploadedBytes: 0,
    checksum: null,
    state: "pending",
    attemptCount: 0,
    lastError: null
  };
}

/** Bytes still to send, for a progress indicator the vet can trust. */
export function remainingBytes(upload: AttachmentUpload): number {
  return Math.max(0, upload.sizeBytes - upload.uploadedBytes);
}
