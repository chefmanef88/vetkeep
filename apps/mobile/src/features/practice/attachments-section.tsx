import { useCallback, useEffect, useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ensureMediaPermission } from "./media-permission";
import { createUpload, remainingBytes, type AttachmentUpload } from "@vetkeep/sync";
import { supabase } from "@/lib/supabase";
import { attachmentQueue, type QueuedUpload } from "@/sync/attachment-queue";
import { AttachmentGrid } from "./attachment-viewer";
import { useStoredAttachments, type StoredAttachment } from "./use-stored-attachments";
import { advanceUpload, releaseLocalCopyIfSafe } from "@/sync/attachment-uploader";
import { ErrorText, PrimaryButton, SecondaryButton } from "@/ui/components";
import { Card, Muted, Pill, SectionTitle, palette } from "@/ui/practice-components";
import { radiusControl } from "@/ui/tokens";

/**
 * Capturing clinical photographs during a consultation.
 *
 * Two things shape this beyond taking a picture. The image is compressed before
 * it leaves, because brief 19.2 asks for that and a vet on a Ghanaian mobile
 * network will not finish a 12 megapixel upload. And the photograph is never
 * written to the phone's own photo library: a wound or a radiograph belongs in
 * the patient record, not in a camera roll that syncs to a personal cloud
 * account.
 */

/**
 * Enough for clinical detail, small enough to send on a slow connection.
 *
 * This is JPEG quality only. The picker does not resize, so a photograph from a
 * high-resolution camera is still large in pixel terms; capping the dimensions
 * needs expo-image-manipulator and should happen before this ships to a vet on
 * a metered connection.
 */
const CAPTURE_QUALITY = 0.7;

export function AttachmentsSection({
  visitId,
  patientId,
  editable
}: {
  visitId: string;
  patientId: string;
  editable: boolean;
}) {
  const [uploads, setUploads] = useState<QueuedUpload[]>([]);
  const {
    attachments: stored,
    error: storedError,
    reload: reloadStored
  } = useStoredAttachments({ visitId });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setUploads(await attachmentQueue.forVisit(visitId));
  }, [visitId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const drive = useCallback(
    async (upload: QueuedUpload) => {
      let current: AttachmentUpload = upload;

      // Step at a time, persisting between steps, so an app killed mid-upload
      // resumes from what was written down rather than starting again.
      for (let step = 0; step < 6; step += 1) {
        const next = await advanceUpload(current, { patientId, visitId });
        const queued: QueuedUpload = { ...upload, ...next };
        await attachmentQueue.update(queued);
        current = next;
        if (next.state === "uploaded" || next.state === "failed") break;
      }

      if (current.state === "uploaded") {
        await releaseLocalCopyIfSafe(current);
        // The local copy has just been deleted, so the stored list is now the
        // only thing that can show this file. Without this the photograph
        // vanishes at the moment it succeeds.
        reloadStored();
      }
      await refresh();
    },
    [patientId, refresh, reloadStored, visitId]
  );

  const capture = useCallback(
    async (source: "camera" | "library") => {
      setError(null);

      // Handles the case iOS makes invisible: once declined it never prompts
      // again, so without this the button simply does nothing.
      if (!(await ensureMediaPermission(source))) return;

      const options: ImagePicker.ImagePickerOptions = {
        // A photograph cannot show a gait, and gait is what a second opinion is
        // most often asked about. Lameness, a seizure, the movement of a
        // bloated rumen, a calf's breathing: all of them are a clip or nothing.
        mediaTypes: ["images", "videos"],
        quality: CAPTURE_QUALITY,
        // A minute is longer than any gait assessment needs, and the ceiling
        // matters more than usual here: this is uploaded over a Ghanaian mobile
        // network, and a clip too long to send is worse than one never offered,
        // because by then the vet has already pointed the phone at the animal.
        videoMaxDuration: 60,
        videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
        exif: false
      };

      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];

      setBusy(true);
      try {
        const attachmentId = globalThis.crypto.randomUUID();
        // The picker reports the kind; the fallbacks only cover a null, and a
        // video falling back to image/jpeg would be refused by the bucket.
        const video = asset.type === "video";
        const mimeType = asset.mimeType ?? (video ? "video/mp4" : "image/jpeg");
        const queued: QueuedUpload = {
          ...createUpload({
            attachmentId,
            localUri: asset.uri,
            filename:
              asset.fileName ??
              `${video ? "clip" : "photo"}-${Date.now()}.${video ? "mp4" : "jpg"}`,
            mimeType,
            sizeBytes: asset.fileSize ?? 0
          }),
          patientId,
          visitId,
          label: asset.fileName ?? (video ? "Video" : "Photograph")
        };

        if (queued.sizeBytes <= 0) {
          // The server rejects a zero size, and guessing one would be a lie
          // about a clinical file.
          setError(
            video
              ? "Could not read the size of that clip. Try recording it again."
              : "Could not read the size of that image. Try taking it again."
          );
          return;
        }

        await attachmentQueue.add(queued);
        await refresh();
        await drive(queued);
      } catch (thrown: unknown) {
        setError(thrown instanceof Error ? thrown.message : "Could not attach that photograph.");
      } finally {
        setBusy(false);
      }
    },
    [drive, patientId, refresh, visitId]
  );

  const retry = useCallback(
    async (upload: QueuedUpload) => {
      setBusy(true);
      try {
        await drive(upload);
      } finally {
        setBusy(false);
      }
    },
    [drive]
  );

  const removeStored = useCallback(
    async (attachment: StoredAttachment) => {
      setError(null);
      // Straight to the server rather than queued: the attachment exists only
      // because its bytes already reached the server, so there is no offline
      // case to carry here.
      const { error: rpcError } = await supabase.rpc("delete_attachment", {
        p_id: attachment.id
      });
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      reloadStored();
    },
    [reloadStored]
  );
  const forget = useCallback(
    (upload: QueuedUpload) => {
      // Removing the queue entry does not delete the photograph. Saying so
      // matters: a vet clearing a stuck upload should not wonder whether they
      // just destroyed the only copy.
      Alert.alert(
        "Remove from this list?",
        "The photograph stays on your phone. It will no longer try to send.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => {
              void attachmentQueue.remove(upload.attachmentId).then(refresh);
            }
          }
        ]
      );
    },
    [refresh]
  );

  return (
    <Card>
      <SectionTitle>Photographs and video</SectionTitle>

      {/* What has reached the server. This card used to show only what was
          still in the upload queue, rendered from the copy on the phone — and
          that copy is deleted once the bytes are confirmed, so anything that
          uploaded successfully disappeared. */}
      <AttachmentGrid
        attachments={stored}
        emptyHint={
          uploads.length > 0 ? "Nothing sent yet." : "Nothing attached to this consultation."
        }
        // Only while the consultation is still being written. The server
        // refuses once it is signed, and offering a control that always fails
        // is worse than not offering one.
        {...(editable ? { onRemove: removeStored } : {})}
      />

      {storedError ? <Muted>{storedError}</Muted> : null}

      {uploads.length === 0
        ? null
        : uploads.map((upload) => (
            <View key={upload.attachmentId} style={styles.row}>
              <Image source={{ uri: upload.localUri }} style={styles.thumb} resizeMode="cover" />
              <View style={styles.rowBody}>
                <Text style={styles.name} numberOfLines={1}>
                  {upload.label}
                </Text>
                <UploadStatus upload={upload} />
                {upload.state === "failed" ? (
                  <View style={styles.actions}>
                    <SecondaryButton label="Try again" onPress={() => void retry(upload)} />
                    <SecondaryButton label="Remove" onPress={() => forget(upload)} />
                  </View>
                ) : null}
              </View>
            </View>
          ))}

      {error ? <ErrorText>{error}</ErrorText> : null}

      {editable ? (
        <>
          <PrimaryButton
            label={busy ? "Working…" : "Take a photograph or video"}
            disabled={busy}
            onPress={() => void capture("camera")}
          />
          <SecondaryButton
            label="Choose a photo or video"
            onPress={() => void capture("library")}
          />
          <Muted>
            Photographs stay in the patient record. They are not saved to your phone&apos;s photo
            gallery.
          </Muted>
        </>
      ) : null}
    </Card>
  );
}

function UploadStatus({ upload }: { upload: AttachmentUpload }) {
  if (upload.state === "uploaded") return <Pill label="sent" tone="good" />;
  if (upload.state === "failed") {
    return (
      <View style={styles.statusStack}>
        <Pill label="not sent" tone="warn" />
        <Muted>{upload.lastError ?? "Could not send"}</Muted>
        <Muted>The photograph is still on this phone.</Muted>
      </View>
    );
  }

  const left = remainingBytes(upload);
  return (
    <View style={styles.statusStack}>
      <Pill label="sending" />
      {upload.sizeBytes > 0 ? (
        <Muted>{Math.round(((upload.sizeBytes - left) / upload.sizeBytes) * 100)}% sent</Muted>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  thumb: { width: 56, height: 56, borderRadius: radiusControl, backgroundColor: palette.greenSoft },
  rowBody: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: "700", color: palette.ink },
  statusStack: { gap: 3, alignItems: "flex-start" },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" }
});
