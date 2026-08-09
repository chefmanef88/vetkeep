import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSync } from "./sync-provider";
import { fonts, hairline, palette, radius, space, type } from "@/ui/tokens";

/**
 * Visible sync status, required by brief 15.8.
 *
 * A vet documenting a consultation in a yard with no signal needs to know their
 * work is held safely rather than lost. Silence is the wrong answer in both
 * directions: an app that says nothing while queueing looks like it failed, and
 * one that claims "saved" without qualification is lying about where the record
 * is.
 */
export function SyncBanner() {
  const router = useRouter();
  const { status, pendingCount, conflicts, deadLetters, flush } = useSync();
  const needsAttention = conflicts.length > 0 || deadLetters.length > 0;

  if (status === "idle" && pendingCount === 0 && !needsAttention) return null;

  const tone = needsAttention ? "attention" : status === "offline" ? "offline" : "working";
  const attentionCount = conflicts.length + deadLetters.length;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (needsAttention) router.push("/practice/sync");
        else void flush();
      }}
      style={({ pressed }) => [
        styles.banner,
        tone === "attention" && styles.attention,
        tone === "offline" && styles.offline,
        pressed && styles.pressed
      ]}
    >
      <Ionicons
        name={
          needsAttention
            ? "alert-circle"
            : status === "syncing"
              ? "sync"
              : status === "offline"
                ? "cloud-offline"
                : "cloud-upload"
        }
        size={20}
        color={tone === "working" ? palette.green : palette.amber}
      />
      <View style={styles.body}>
        <Text style={[styles.title, tone !== "working" && styles.attentionText]}>
          {needsAttention
            ? `${attentionCount} item${attentionCount === 1 ? "" : "s"} need you`
            : status === "syncing"
              ? "Sending…"
              : status === "offline"
                ? `${pendingCount} waiting to send`
                : `${pendingCount} saved on this phone`}
        </Text>
        {/* Tone is carried by the words as well as the colour, never colour alone. */}
        <Text style={styles.detail}>
          {needsAttention
            ? "Open sync to resolve"
            : status === "offline"
              ? "Held safely. Tap to try again."
              : "Tap to send now"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={palette.quiet} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: palette.greenSoft,
    borderRadius: radius,
    borderWidth: hairline,
    borderColor: palette.line
  },
  offline: { backgroundColor: palette.amberSoft },
  attention: { backgroundColor: palette.amberSoft },
  pressed: { opacity: 0.75 },
  body: { flex: 1, gap: 1 },
  title: { fontFamily: fonts.semibold, fontSize: 14, color: palette.ink },
  attentionText: { color: palette.amber },
  detail: { ...type.small, fontSize: 12, color: palette.quiet }
});
