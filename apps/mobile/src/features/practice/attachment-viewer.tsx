import { useState } from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";

import { isImage, isVideo, type StoredAttachment } from "./use-stored-attachments";
import { Muted } from "@/ui/practice-components";
import { fonts, hairline, palette, radius, radiusControl, space, type } from "@/ui/tokens";

/**
 * Looking at what has already been sent.
 *
 * The attachments card used to render only the copy on the phone, which is
 * deleted once the server confirms the bytes — so a photograph became invisible
 * by uploading successfully, which is the one outcome nobody expects. Everything
 * was still there; nothing read it back.
 *
 * Tapping opens it full screen, because the reason a clinical photograph exists
 * is to be looked at closely. A thumbnail of a wound is not a second opinion.
 */

export function AttachmentGrid({
  attachments,
  emptyHint
}: {
  attachments: StoredAttachment[];
  emptyHint: string;
}) {
  const [open, setOpen] = useState<StoredAttachment | null>(null);

  if (attachments.length === 0) return <Muted>{emptyHint}</Muted>;

  return (
    <>
      <View style={styles.grid}>
        {attachments.map((attachment) => (
          <Thumb key={attachment.id} attachment={attachment} onPress={() => setOpen(attachment)} />
        ))}
      </View>

      <Modal
        visible={open !== null}
        animationType="fade"
        onRequestClose={() => setOpen(null)}
        // Full screen over everything, so the image is as large as the phone.
        presentationStyle="overFullScreen"
        transparent
      >
        {open ? <Viewer attachment={open} onClose={() => setOpen(null)} /> : null}
      </Modal>
    </>
  );
}

function Thumb({ attachment, onPress }: { attachment: StoredAttachment; onPress: () => void }) {
  const video = isVideo(attachment.mimeType);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${attachment.filename}`}
      onPress={onPress}
      style={({ pressed }) => [styles.thumb, pressed && styles.pressed]}
    >
      {isImage(attachment.mimeType) && attachment.url ? (
        <Image source={{ uri: attachment.url }} style={styles.thumbImage} resizeMode="cover" />
      ) : (
        // A video has no still to show without decoding a frame, and a document
        // has no picture at all. An icon that says which is better than a grey
        // box that says nothing.
        <View style={styles.thumbIcon}>
          <Ionicons name={video ? "videocam" : "document-text"} size={26} color={palette.quiet} />
        </View>
      )}

      {video ? (
        <View style={styles.playBadge}>
          <Ionicons name="play" size={12} color={palette.surface} />
        </View>
      ) : null}
    </Pressable>
  );
}

function Viewer({ attachment, onClose }: { attachment: StoredAttachment; onClose: () => void }) {
  return (
    <View style={styles.viewer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={styles.close}
      >
        <Ionicons name="close" size={24} color={palette.surface} />
      </Pressable>

      {attachment.url === null ? (
        <Text style={styles.viewerNote}>
          This file could not be opened. It may need a connection.
        </Text>
      ) : isVideo(attachment.mimeType) ? (
        <VideoPlayback uri={attachment.url} />
      ) : isImage(attachment.mimeType) ? (
        <Image source={{ uri: attachment.url }} style={styles.full} resizeMode="contain" />
      ) : (
        <Text style={styles.viewerNote}>{attachment.filename}</Text>
      )}

      <Text style={styles.viewerCaption} numberOfLines={1}>
        {attachment.filename}
      </Text>
    </View>
  );
}

function VideoPlayback({ uri }: { uri: string }) {
  // Not looping and not muted: this is a clinical recording being reviewed, not
  // a decoration. It starts on its own because the vet has just asked for it.
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.play();
  });

  return (
    <VideoView
      style={styles.full}
      player={player}
      nativeControls
      // contain, so a clip recorded in portrait is not cropped to a square. A
      // gait is in the legs, and the legs are at the edge of the frame.
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
    />
  );
}

const THUMB = 88;

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radiusControl,
    overflow: "hidden",
    backgroundColor: palette.ground,
    borderWidth: hairline,
    borderColor: palette.line
  },
  pressed: { opacity: 0.7 },
  thumbImage: { width: "100%", height: "100%" },
  thumbIcon: { flex: 1, alignItems: "center", justifyContent: "center" },
  playBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(23,33,27,0.72)",
    alignItems: "center",
    justifyContent: "center"
  },

  viewer: {
    flex: 1,
    backgroundColor: "rgba(10,14,11,0.96)",
    alignItems: "center",
    justifyContent: "center",
    gap: space.lg,
    padding: space.lg
  },
  close: {
    position: "absolute",
    top: space.xxl,
    right: space.lg,
    width: 44,
    height: 44,
    borderRadius: radius,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)"
  },
  full: { width: "100%", height: "72%" },
  viewerNote: { ...type.body, color: palette.surface, textAlign: "center" },
  viewerCaption: { fontFamily: fonts.medium, fontSize: 13, color: "rgba(255,255,255,0.72)" }
});
