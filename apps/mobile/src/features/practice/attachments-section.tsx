import { useCallback, useEffect, useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { createUpload, remainingBytes, type AttachmentUpload } from "@vetkeep/sync";
import { attachmentQueue, type QueuedUpload } from "@/sync/attachment-queue";
import { advanceUpload, releaseLocalCopyIfSafe } from "@/sync/attachment-uploader";
import { ErrorText, PrimaryButton, SecondaryButton } from "@/ui/components";
import { Card, Muted, Pill, SectionTitle, palette } from "@/ui/practice-components";

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
      }
      await refresh();
    },
    [patientId, refresh, visitId]
  );

  const capture = useCallback(
    async (source: "camera" | "library") => {
      setError(null);

      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setError(
          source === "camera"
            ? "VetKeep needs camera access to photograph the patient."
            : "VetKeep needs access to your photos to attach one."
        );
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        quality: CAPTURE_QUALITY,
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
        const queued: QueuedUpload = {
          ...createUpload({
            attachmentId,
            localUri: asset.uri,
            filename: asset.fileName ?? `photo-${Date.now()}.jpg`,
            mimeType: asset.mimeType ?? "image/jpeg",
            sizeBytes: asset.fileSize ?? 0
          }),
          patientId,
          visitId,
          label: asset.fileName ?? "Photograph"
        };

        if (queued.sizeBytes <= 0) {
          // The server rejects a zero size, and guessing one would be a lie
          // about a clinical file.
          setError("Could not read the size of that image. Try taking it again.");
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
      <SectionTitle>Photographs</SectionTitle>

      {uploads.length === 0 ? (
        <Muted>Nothing attached to this visit.</Muted>
      ) : (
        uploads.map((upload) => (
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
        ))
      )}

      {error ? <ErrorText>{error}</ErrorText> : null}

      {editable ? (
        <>
          <PrimaryButton
            label={busy ? "Working…" : "Take a photograph"}
            disabled={busy}
            onPress={() => void capture("camera")}
          />
          <SecondaryButton
            label="Choose an existing photo"
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
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: palette.greenSoft },
  rowBody: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: "700", color: palette.ink },
  statusStack: { gap: 3, alignItems: "flex-start" },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" }
});
