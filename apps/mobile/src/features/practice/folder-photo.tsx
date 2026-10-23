import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createUpload } from "@vetkeep/sync";
import { supabase } from "@/lib/supabase";
import { attachmentQueue, type QueuedUpload } from "@/sync/attachment-queue";
import { sweepAttachments } from "@/sync/attachment-sweeper";
import { Avatar } from "@/ui/elements";
import { ErrorText } from "@/ui/components";
import { fonts, palette, space, type } from "@/ui/tokens";

/**
 * The photograph on a folder.
 *
 * Reuses the attachment queue rather than uploading directly: a picture taken
 * on a farm has to survive the drive home the same way a consultation does. The
 * folder is pointed at the attachment immediately, so the vet sees what they
 * just took, and the disc falls back to initials until the bytes arrive.
 */

const CAPTURE_QUALITY = 0.6;

export function FolderPhoto({
  patientId,
  name,
  photoUri,
  hasPhoto,
  onChanged
}: {
  patientId: string;
  name: string;
  photoUri: string | null;
  hasPhoto: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A picture on this phone that has not reached the server yet. */
  const [pending, setPending] = useState<QueuedUpload | null>(null);

  const refreshPending = useCallback(async () => {
    setPending(await attachmentQueue.folderPhotoFor(patientId));
  }, [patientId]);

  useEffect(() => {
    // Survives a restart, because the queue does. A photograph taken on a farm
    // is still shown on the folder the next morning, before it has been sent.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshPending();
  }, [refreshPending]);

  async function choose(source: "camera" | "library") {
    setError(null);
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError(
        source === "camera"
          ? "VetKeep needs camera access to photograph the animal."
          : "VetKeep needs access to your photos to use one."
      );
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: CAPTURE_QUALITY,
            exif: false
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: CAPTURE_QUALITY,
            exif: false
          });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    if (!asset.fileSize || asset.fileSize <= 0) {
      // The server rejects a zero size, and guessing one would be a lie about a
      // clinical file.
      setError("Could not read the size of that image. Try taking it again.");
      return;
    }

    setBusy(true);
    try {
      const attachmentId = globalThis.crypto.randomUUID();
      const queued: QueuedUpload = {
        ...createUpload({
          attachmentId,
          localUri: asset.uri,
          filename: asset.fileName ?? `${name}-${Date.now()}.jpg`,
          mimeType: asset.mimeType ?? "image/jpeg",
          sizeBytes: asset.fileSize
        }),
        patientId,
        // Belongs to the animal rather than to any one consultation.
        visitId: null,
        label: `Photograph of ${name}`
      };

      // Queued, and that is the whole of what has to succeed here. The picture
      // is on the phone and recorded as wanting to go; the sweeper registers
      // it, uploads it and points the folder at it when there is a connection.
      //
      // It used to register the attachment and set the folder photograph from
      // here, which meant a picture taken with no signal failed outright — and
      // retrying afterwards did not help, because nothing was ever going to
      // collect what had been queued.
      await attachmentQueue.add(queued);
      setPending(queued);
      onChanged();

      // Tried at once for the common case, where there is signal and the vet
      // watches it appear. A failure is not reported: the picture is safely
      // queued either way, and the caption already says it is waiting.
      void sweepAttachments()
        .then(() => refreshPending())
        .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    setError(null);
    setBusy(true);
    // Clears the reference, not the attachment: the photograph stays in the
    // record where it may still be clinically relevant.
    // Omitting p_attachment_id lets the function default it to null.
    const { error: rpcError } = await supabase.rpc("set_patient_photo", {
      p_patient_id: patientId
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onChanged();
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={photoUri ? `Change the photograph of ${name}` : `Add a photograph`}
        onPress={() => void choose("camera")}
        disabled={busy}
        style={({ pressed }) => [styles.photoTarget, pressed && styles.pressed]}
      >
        {/* The server's copy if there is one, otherwise the one still on this
            phone. A vet who has just taken a picture should see it, not a
            disc of initials and a promise. */}
        <Avatar name={name} photoUri={photoUri ?? pending?.localUri ?? null} size={84} />
        <View style={styles.badge}>
          <Ionicons name="camera" size={14} color={palette.surface} />
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Text style={styles.caption}>
          {pending
            ? pending.state === "failed"
              ? "Saved on this phone. It will be sent when you have a connection."
              : "Waiting to send."
            : hasPhoto && !photoUri
              ? "Photograph taken. It will appear once it has uploaded."
              : photoUri
                ? "Tap the picture to take another."
                : "A picture identifies this animal faster than a code."}
        </Text>
        <View style={styles.buttonRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void choose("library")}
            disabled={busy}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Ionicons name="images-outline" size={15} color={palette.brandInk} />
            <Text style={styles.actionText}>Choose</Text>
          </Pressable>
          {hasPhoto ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void removePhoto()}
              disabled={busy}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <Ionicons name="close-circle-outline" size={15} color={palette.red} />
              <Text style={[styles.actionText, styles.removeText]}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: space.lg },
  photoTarget: { position: "relative" },
  pressed: { opacity: 0.7 },
  badge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: palette.brand,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: palette.surface
  },
  actions: { flex: 1, gap: space.sm },
  caption: { ...type.small, fontSize: 12, color: palette.quiet },
  buttonRow: { flexDirection: "row", gap: space.md },
  action: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: space.xs },
  actionText: { fontFamily: fonts.medium, fontSize: 13, color: palette.brandInk },
  removeText: { color: palette.red }
});
