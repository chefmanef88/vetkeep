import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Turns a folder's photograph into something an Image can display.
 *
 * The attachments bucket is private, so a path is not a URL: the object has to
 * be signed for. The signature is short-lived by design — a link that leaked
 * from a screenshot should stop working — which is why this resolves on demand
 * rather than being stored anywhere.
 *
 * Returns null while resolving, and null when the file is not there yet. A
 * photograph taken in a field is queued for hours before its bytes reach the
 * server, and during that time the folder falls back to initials rather than
 * showing a broken image.
 */

const SIGNED_URL_SECONDS = 60 * 30;

export function usePatientPhoto(attachmentId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      // Cleared inside the async body rather than synchronously in the effect,
      // so there is one place that decides what the URL becomes.
      if (!attachmentId) {
        if (active) setUrl(null);
        return;
      }

      const { data: attachment } = await supabase
        .from("attachments")
        .select("storage_bucket, storage_path, upload_status")
        .eq("id", attachmentId)
        .is("deleted_at", null)
        .maybeSingle();

      // Nothing to sign until the bytes have actually arrived.
      if (!active || !attachment || attachment.upload_status !== "uploaded") {
        if (active) setUrl(null);
        return;
      }

      const { data: signed } = await supabase.storage
        .from(attachment.storage_bucket)
        .createSignedUrl(attachment.storage_path, SIGNED_URL_SECONDS);

      if (active) setUrl(signed?.signedUrl ?? null);
    })();

    return () => {
      active = false;
    };
  }, [attachmentId]);

  return url;
}
