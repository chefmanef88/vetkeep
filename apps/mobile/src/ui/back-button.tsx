import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { fonts, palette, space, touchTarget } from "./tokens";

/**
 * The way back out of a detail screen.
 *
 * React Navigation draws a back arrow when a screen has something before it in
 * its own stack. Opening a folder from the Animals tab makes that folder the
 * *first* screen of the practice stack — the thing to go back to is in the tab
 * navigator, one level up — so no arrow was drawn and there was no way back
 * except the system gesture, which is invisible and which Android does not
 * share.
 *
 * `canGoBack` is asked rather than assumed: a screen opened from a deep link or
 * a notification genuinely has nowhere to return to, and an arrow that does
 * nothing is worse than no arrow.
 */
export function BackButton() {
  const router = useRouter();

  if (!router.canGoBack()) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      onPress={() => router.back()}
      // Generous beyond the glyph: this is used with wet or gloved hands, and
      // it sits in the corner where the thumb is least precise.
      hitSlop={space.md}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons name="chevron-back" size={24} color={palette.green} />
      <Text style={styles.label}>Back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: touchTarget,
    // Pulled left so the chevron lines up with the screen's own left margin
    // rather than sitting inside the header's padding.
    marginLeft: -space.sm,
    paddingRight: space.sm
  },
  pressed: { opacity: 0.6 },
  label: { fontFamily: fonts.medium, fontSize: 16, color: palette.green, marginLeft: -2 }
});

/**
 * Wrapped in a View because a header slot measures its child, and a component
 * that can return null would otherwise collapse the slot and shift the title.
 */
export function HeaderBack() {
  return (
    <View>
      <BackButton />
    </View>
  );
}
