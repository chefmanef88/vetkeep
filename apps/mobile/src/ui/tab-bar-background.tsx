import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";

import { hairline, palette } from "./tokens";

/**
 * The material the tab bar is made of.
 *
 * A floating translucent layer rather than an opaque strip, with the page
 * scrolling underneath it. That is the whole point of the treatment: the bar
 * reads as something resting above the content rather than a band cut out of
 * the screen, and the blur of whatever is passing beneath is what makes it look
 * like a material instead of a colour.
 *
 * The top edge is a bright hairline, which is the light catching the near edge
 * of a piece of glass. It is doing the work a divider would otherwise do, and
 * doing it without drawing a line across the page.
 *
 * Two things it refuses to do. It does not stack translucency on translucency —
 * anything the bar sits on is page content, never another frosted surface,
 * because two of them together stop being legible. And it turns solid for
 * anyone who has asked for reduced transparency: that setting exists precisely
 * because a blurred background behind small text is hard to read, and honouring
 * it matters more on a tool used outdoors at midday than almost anywhere else.
 */
export function TabBarBackground() {
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // iOS only; Android resolves false and keeps the blur.
    void AccessibilityInfo.isReduceTransparencyEnabled?.().then((on) => {
      if (!cancelled) setReduceTransparency(Boolean(on));
    });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      (on: boolean) => setReduceTransparency(on)
    );

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  if (reduceTransparency || Platform.OS === "web") {
    return <View style={[StyleSheet.absoluteFill, styles.solid]} />;
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* A large surface should read as thicker than a small chip, so the blur
          is deliberately heavy rather than a suggestion of one. */}
      <BlurView intensity={72} tint="light" style={StyleSheet.absoluteFill} />
      {/* A wash over the blur, because pure blur over a dark photograph turns
          the bar dark and the labels stop reading against it. */}
      <View style={[StyleSheet.absoluteFill, styles.wash]} />
      <View style={styles.edge} />
    </View>
  );
}

const styles = StyleSheet.create({
  solid: {
    backgroundColor: palette.surface,
    borderTopWidth: hairline,
    borderTopColor: palette.line
  },
  wash: { backgroundColor: "rgba(247,248,245,0.55)" },
  edge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: hairline,
    backgroundColor: "rgba(255,255,255,0.75)"
  }
});
