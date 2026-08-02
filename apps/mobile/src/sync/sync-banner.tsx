import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSync } from "./sync-provider";
import { palette } from "@/ui/practice-components";

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

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (needsAttention) router.push("/practice/sync");
        else void flush();
      }}
      style={[
        styles.banner,
        tone === "attention" && styles.attention,
        tone === "offline" && styles.offline
      ]}
    >
      <View style={styles.body}>
        <Text style={[styles.title, tone === "attention" && styles.attentionText]}>
          {needsAttention
            ? `${conflicts.length + deadLetters.length} item${
                conflicts.length + deadLetters.length === 1 ? "" : "s"
              } need you`
            : status === "syncing"
              ? "Sending…"
              : status === "offline"
                ? `${pendingCount} waiting to send`
                : `${pendingCount} saved on this phone`}
        </Text>
        <Text style={styles.detail}>
          {needsAttention
            ? "Open sync to resolve"
            : status === "offline"
              ? "Held safely. Tap to try again."
              : "Tap to send now"}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: palette.greenSoft,
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  // Tone is carried by text as well as colour, never colour alone.
  offline: { backgroundColor: palette.amberSoft },
  attention: { backgroundColor: palette.amberSoft },
  body: { flex: 1, gap: 1 },
  title: { fontSize: 14, fontWeight: "700", color: palette.ink },
  attentionText: { color: palette.amber },
  detail: { fontSize: 12, color: palette.quiet }
});
