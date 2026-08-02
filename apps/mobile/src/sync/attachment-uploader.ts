import * as Crypto from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import {
  applyUploadEvent,
  canDeleteLocalFile,
  nextUploadAction,
  type AttachmentUpload
} from "@vetkeep/sync";
import { supabase } from "@/lib/supabase";

/**
 * Drives one attachment from the device to private storage.
 *
 * The decisions live in @vetkeep/sync where they are unit tested; this module is
 * the input and output around them. It never decides when the local copy may
 * go, it only asks.
 */

const BUCKET = "clinical-attachments";

export async function computeChecksum(localUri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64
  });
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64, {
    encoding: Crypto.CryptoEncoding.HEX
  });
}

/**
 * Advances one upload by a single step, returning the new state.
 *
 * One step at a time so a caller can persist progress between steps: an app
 * killed mid-upload resumes from what was last written down rather than from
 * the beginning.
 */
export async function advanceUpload(
  upload: AttachmentUpload,
  context: { patientId?: string | null; visitId?: string | null; deviceId?: string | null } = {}
): Promise<AttachmentUpload> {
  const action = nextUploadAction(upload);

  try {
    switch (action.kind) {
      case "register": {
        const { data, error } = await supabase.rpc("register_attachment", {
          p_id: upload.attachmentId,
          p_original_filename: upload.filename,
          p_mime_type: upload.mimeType,
          p_size_bytes: upload.sizeBytes,
          p_attachment_type: "photo",
          ...(context.patientId ? { p_patient_id: context.patientId } : {}),
          ...(context.visitId ? { p_visit_id: context.visitId } : {}),
          ...(context.deviceId ? { p_device_id: context.deviceId } : {})
        });
        if (error) throw new Error(error.message);
        return applyUploadEvent(upload, { kind: "registered", storagePath: String(data) });
      }

      case "upload": {
        if (!upload.storagePath) throw new Error("No storage path assigned yet");

        await supabase.rpc("mark_attachment_uploading", { p_id: upload.attachmentId });

        const base64 = await FileSystem.readAsStringAsync(upload.localUri, {
          encoding: FileSystem.EncodingType.Base64
        });
        const bytes = decodeBase64(base64);

        // upsert lets a resumed attempt overwrite a partial object rather than
        // failing on a name that already exists.
        const { error } = await supabase.storage.from(BUCKET).upload(upload.storagePath, bytes, {
          contentType: upload.mimeType,
          upsert: true
        });
        if (error) throw new Error(error.message);

        const checksum = await computeChecksum(upload.localUri);
        return applyUploadEvent(upload, { kind: "transferred", checksum });
      }

      case "confirm": {
        const { error } = await supabase.rpc("confirm_attachment_upload", {
          p_id: upload.attachmentId,
          p_checksum_sha256: action.checksum,
          ...(context.deviceId ? { p_device_id: context.deviceId } : {})
        });
        if (error) throw new Error(error.message);
        return applyUploadEvent(upload, { kind: "confirmed" });
      }

      case "abandon": {
        await supabase.rpc("mark_attachment_failed", {
          p_id: upload.attachmentId,
          p_reason: action.reason
        });
        return upload;
      }

      case "wait":
      case "done":
        return upload;
    }
  } catch (thrown: unknown) {
    const reason = thrown instanceof Error ? thrown.message : "Upload failed";
    return applyUploadEvent(upload, { kind: "failed", reason });
  }
}

/**
 * Releases the device's copy, and only when the server has confirmed it.
 *
 * Routed through canDeleteLocalFile rather than checking a status string here,
 * so there is exactly one place in the codebase that decides this.
 */
export async function releaseLocalCopyIfSafe(upload: AttachmentUpload): Promise<boolean> {
  if (!canDeleteLocalFile(upload)) return false;
  try {
    await FileSystem.deleteAsync(upload.localUri, { idempotent: true });
    return true;
  } catch {
    // Failing to reclaim space is not worth surfacing; the bytes are safe.
    return false;
  }
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** React Native has no Buffer, and atob is not reliably present. */
function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, "");
  const bytes = new Uint8Array((clean.length * 3) / 4);
  let byteIndex = 0;
  let buffer = 0;
  let bits = 0;

  for (const char of clean) {
    buffer = (buffer << 6) | BASE64_ALPHABET.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[byteIndex] = (buffer >> bits) & 0xff;
      byteIndex += 1;
    }
  }

  return bytes.subarray(0, byteIndex);
}
