import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

/**
 * The attachments that already reached the server, ready to look at.
 *
 * The attachments card used to show only what was still in the upload queue,
 * rendered from the copy on the phone. That copy is deleted once the server
 * confirms the bytes, so a photograph became invisible by succeeding — which is
 * the one outcome a vet has no reason to expect. Everything sent was still
 * there, and nothing ever read it back.
 *
 * Signed in one call rather than one per file: a consultation with eight
 * photographs on a Ghanaian mobile network should not need eight round trips
 * before anything appears.
 *
 * The signature is short-lived by design — a link that leaked from a screenshot
 * should stop working — so this resolves on demand and is never stored.
 */

const SIGNED_URL_SECONDS = 60 * 30;

export interface StoredAttachment {
  id: string;
  filename: string;
  mimeType: string;
  attachmentType: string;
  sizeBytes: number;
  capturedAt: string | null;
  /** Null when the object could not be signed; the row is still listed. */
  url: string | null;
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function isVideo(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}

interface Row {
  id: string;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  attachment_type: string;
  size_bytes: number;
  captured_at: string | null;
}

export function useStoredAttachments(scope: { visitId?: string; patientId?: string }): {
  attachments: StoredAttachment[];
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const { visitId, patientId } = scope;
  const [attachments, setAttachments] = useState<StoredAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    let active = true;

    void (async () => {
      if (!visitId && !patientId) {
        if (active) {
          setAttachments([]);
          setLoading(false);
        }
        return;
      }

      let query = supabase
        .from("attachments")
        .select(
          "id, storage_bucket, storage_path, original_filename, mime_type, attachment_type, size_bytes, captured_at"
        )
        .is("deleted_at", null)
        // Only what is actually there. A row still uploading has a path but no
        // bytes behind it, and signing one produces a link that 404s.
        .eq("upload_status", "uploaded");

      query = visitId ? query.eq("visit_id", visitId) : query.eq("patient_id", patientId ?? "");

      const { data, error: queryError } = await query.order("created_at", { ascending: true });

      if (!active) return;

      if (queryError) {
        // Offline this is the normal case, and the card already shows whatever
        // is still in the upload queue. Saying nothing is better than an error
        // over a list that was never going to load.
        setError("Could not load what has been sent.");
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as Row[];
      if (rows.length === 0) {
        setAttachments([]);
        setError(null);
        setLoading(false);
        return;
      }

      // One signing call for the whole card. They share a bucket, so the first
      // row's is the bucket for all of them.
      const bucket = rows[0]?.storage_bucket ?? "clinical-attachments";
      const { data: signed } = await supabase.storage.from(bucket).createSignedUrls(
        rows.map((row) => row.storage_path),
        SIGNED_URL_SECONDS
      );

      if (!active) return;

      const urlByPath = new Map<string, string>();
      for (const entry of signed ?? []) {
        if (entry.path && entry.signedUrl) urlByPath.set(entry.path, entry.signedUrl);
      }

      setAttachments(
        rows.map((row) => ({
          id: row.id,
          filename: row.original_filename,
          mimeType: row.mime_type,
          attachmentType: row.attachment_type,
          sizeBytes: row.size_bytes,
          capturedAt: row.captured_at,
          url: urlByPath.get(row.storage_path) ?? null
        }))
      );
      setError(null);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [visitId, patientId, nonce]);

  return { attachments, loading, error, reload };
}
