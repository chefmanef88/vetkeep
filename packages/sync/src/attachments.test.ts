import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_ATTEMPTS,
  applyUploadEvent,
  canDeleteLocalFile,
  createUpload,
  nextUploadAction,
  remainingBytes,
  type AttachmentUpload
} from "./attachments";

function upload(overrides: Partial<AttachmentUpload> = {}): AttachmentUpload {
  return {
    ...createUpload({
      attachmentId: "a-1",
      localUri: "file:///photos/wound.jpg",
      filename: "wound.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1000
    }),
    ...overrides
  };
}

const CHECKSUM = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("canDeleteLocalFile", () => {
  it("refuses while the file has not been registered", () => {
    expect(canDeleteLocalFile(upload())).toBe(false);
  });

  it("refuses part way through the transfer", () => {
    expect(canDeleteLocalFile(upload({ state: "uploading", uploadedBytes: 900 }))).toBe(false);
  });

  it("refuses when every byte is across but nothing is confirmed", () => {
    // The bytes arriving is not the same as the server agreeing it has them.
    // Deleting here would destroy the only copy of a clinical image on the word
    // of a request that could still fail.
    expect(
      canDeleteLocalFile(upload({ state: "uploading", uploadedBytes: 1000, checksum: CHECKSUM }))
    ).toBe(false);
  });

  it("refuses when the upload failed, however many times", () => {
    expect(
      canDeleteLocalFile(upload({ state: "failed", attemptCount: 99, uploadedBytes: 1000 }))
    ).toBe(false);
  });

  it("allows only once the server has confirmed the checksum", () => {
    expect(
      canDeleteLocalFile(upload({ state: "uploaded", uploadedBytes: 1000, checksum: CHECKSUM }))
    ).toBe(true);
  });

  it("refuses a confirmed state with no checksum, which should not happen", () => {
    // Defensive: if the two ever disagree, keep the file.
    expect(canDeleteLocalFile(upload({ state: "uploaded", checksum: null }))).toBe(false);
  });
});

describe("nextUploadAction", () => {
  it("registers first, so the server chooses the path", () => {
    expect(nextUploadAction(upload())).toEqual({ kind: "register" });
  });

  it("uploads from the beginning once registered", () => {
    const registered = applyUploadEvent(upload(), {
      kind: "registered",
      storagePath: "vet/att/wound.jpg"
    });
    expect(nextUploadAction(registered)).toEqual({ kind: "upload", fromByte: 0 });
  });

  it("resumes from where the last attempt stopped", () => {
    // Restarting from zero on a slow connection can mean the upload never
    // finishes at all.
    const partial = upload({
      state: "uploading",
      storagePath: "vet/att/wound.jpg",
      uploadedBytes: 640
    });
    expect(nextUploadAction(partial)).toEqual({ kind: "upload", fromByte: 640 });
  });

  it("keeps uploading when the bytes are across but no checksum exists yet", () => {
    const noChecksum = upload({
      state: "uploading",
      storagePath: "vet/att/wound.jpg",
      uploadedBytes: 1000,
      checksum: null
    });
    expect(nextUploadAction(noChecksum)).toMatchObject({ kind: "upload" });
  });

  it("confirms once the bytes and the checksum are both in hand", () => {
    const ready = upload({
      state: "uploading",
      storagePath: "vet/att/wound.jpg",
      uploadedBytes: 1000,
      checksum: CHECKSUM
    });
    expect(nextUploadAction(ready)).toEqual({ kind: "confirm", checksum: CHECKSUM });
  });

  it("waits before retrying a failure rather than hammering a dead connection", () => {
    const failed = upload({ state: "failed", attemptCount: 2, lastError: "no signal" });
    const action = nextUploadAction(failed);
    expect(action.kind).toBe("wait");
  });

  it("backs off further with each failure", () => {
    const first = nextUploadAction(upload({ state: "failed", attemptCount: 1 }));
    const later = nextUploadAction(upload({ state: "failed", attemptCount: 3 }));
    if (first.kind !== "wait" || later.kind !== "wait") throw new Error("expected waits");
    expect(later.afterMs).toBeGreaterThan(first.afterMs);
  });

  it("abandons after a genuine run of failures, without deleting anything", () => {
    const exhausted = upload({
      state: "failed",
      attemptCount: MAX_UPLOAD_ATTEMPTS,
      lastError: "server refused the file type"
    });
    const action = nextUploadAction(exhausted);
    expect(action).toMatchObject({ kind: "abandon" });
    // Abandoning is where a naive implementation cleans up. The file stays.
    expect(canDeleteLocalFile(exhausted)).toBe(false);
  });

  it("stops once confirmed", () => {
    expect(nextUploadAction(upload({ state: "uploaded", checksum: CHECKSUM }))).toEqual({
      kind: "done"
    });
  });
});

describe("applyUploadEvent", () => {
  it("records the path the server assigned", () => {
    const next = applyUploadEvent(upload(), {
      kind: "registered",
      storagePath: "vet/att/wound.jpg"
    });
    expect(next.storagePath).toBe("vet/att/wound.jpg");
    expect(next.state).toBe("registered");
  });

  it("never lets progress move backwards", () => {
    // A retried chunk reporting an older offset would otherwise undo real
    // progress and restart part of the transfer.
    const advanced = upload({ state: "uploading", uploadedBytes: 800 });
    const next = applyUploadEvent(advanced, { kind: "progress", uploadedBytes: 300 });
    expect(next.uploadedBytes).toBe(800);
  });

  it("clamps progress to the real file size", () => {
    const next = applyUploadEvent(upload(), { kind: "progress", uploadedBytes: 99999 });
    expect(next.uploadedBytes).toBe(1000);
  });

  it("counts a failure and keeps the reason for the vet", () => {
    const next = applyUploadEvent(upload({ attemptCount: 1 }), {
      kind: "failed",
      reason: "connection lost"
    });
    expect(next.attemptCount).toBe(2);
    expect(next.lastError).toBe("connection lost");
    expect(next.state).toBe("failed");
  });

  it("keeps the bytes already sent when an attempt fails", () => {
    // Losing this would restart the transfer from zero on the next try.
    const partial = upload({ state: "uploading", uploadedBytes: 750 });
    const next = applyUploadEvent(partial, { kind: "failed", reason: "timeout" });
    expect(next.uploadedBytes).toBe(750);
  });

  it("walks a whole upload from capture to confirmed", () => {
    let current = upload();
    expect(canDeleteLocalFile(current)).toBe(false);

    current = applyUploadEvent(current, { kind: "registered", storagePath: "vet/att/w.jpg" });
    current = applyUploadEvent(current, { kind: "progress", uploadedBytes: 500 });
    expect(canDeleteLocalFile(current)).toBe(false);

    current = applyUploadEvent(current, { kind: "transferred", checksum: CHECKSUM });
    expect(canDeleteLocalFile(current)).toBe(false);

    current = applyUploadEvent(current, { kind: "confirmed" });
    expect(canDeleteLocalFile(current)).toBe(true);
    expect(remainingBytes(current)).toBe(0);
  });

  it("survives an interruption and finishes on the second run", () => {
    let current = applyUploadEvent(upload(), {
      kind: "registered",
      storagePath: "vet/att/w.jpg"
    });
    current = applyUploadEvent(current, { kind: "progress", uploadedBytes: 400 });
    current = applyUploadEvent(current, { kind: "failed", reason: "no signal" });

    // Reconnecting resumes rather than restarting.
    current = applyUploadEvent(current, { kind: "progress", uploadedBytes: 1000 });
    current = applyUploadEvent(current, { kind: "transferred", checksum: CHECKSUM });
    current = applyUploadEvent(current, { kind: "confirmed" });

    expect(current.state).toBe("uploaded");
    expect(canDeleteLocalFile(current)).toBe(true);
  });
});

describe("remainingBytes", () => {
  it("reports what is left to send", () => {
    expect(remainingBytes(upload({ uploadedBytes: 250 }))).toBe(750);
  });

  it("never reports a negative amount", () => {
    expect(remainingBytes(upload({ uploadedBytes: 5000 }))).toBe(0);
  });
});
