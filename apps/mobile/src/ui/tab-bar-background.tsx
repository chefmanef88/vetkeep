import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";

import { hairline, palette } from "./tokens";

/**
 * The material the tab bar is made of.
 *
 * Sits flush against the bottom of the screen and runs the full width,
 * including the home-indicator area, so that content scrolling past is blurred
 * underneath it rather than appearing in a gap below it. A floating pill left a
 * strip of live page visible beneath the bar, which read as two competing
 * surfaces instead of one.
 *
 * The top edge is a bright hairline — light catching the near edge of the
 * glass, doing the work a divider would do without drawing a line.
 *
 * It does not stack translucency on translucency: whatever is behind the bar is
 * page content, never another frosted surface, because two together stop being
 * legible.
 *
 * Reduced transparency turns it solid. That setting exists because blurred
 * backgrounds behind small text are hard to read, which matters more on a tool
 * used outdoors at midday than in most places.
 */
export function TabBarBackground() {
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // iOS only; Android resolves false, which is fine because Android does not
    // get a blur in the first place.
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

  /**
   * Android does not get the glass, and that is a decision rather than a gap.
   *
   * expo-blur defaults to no blur on Android at all — the prop that enables a
   * real one is marked experimental and redraws the blurred region continuously,
   * which is a poor trade on the inexpensive hardware this app is most likely to
   * run on in the field. A translucent panel with no blur behind it is not a
   * softer version of the effect, it is a smeared one.
   *
   * So Android gets a near-opaque surface with elevation, which is what a
   * Material bottom bar is supposed to look like anyway. Each platform gets the
   * thing it already knows rather than one idiom forced onto both.
   */
  const solid = reduceTransparency || Platform.OS !== "ios";

  if (solid) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.solid]}>
        <View style={styles.topEdge} />
      </View>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* A large surface should read as thicker than a small chip, so the blur
          is deliberately heavy rather than a suggestion of one. */}
      <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
      {/* A wash over the blur. Pure blur over a dark photograph turns the bar
          dark and the labels stop holding against it. */}
      <View style={[StyleSheet.absoluteFill, styles.wash]} />
      <View style={styles.topEdge} />
    </View>
  );
}

const styles = StyleSheet.create({
  solid: { backgroundColor: palette.surface },
  wash: { backgroundColor: "rgba(247,248,245,0.62)" },
  topEdge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: hairline,
    backgroundColor: "rgba(255,255,255,0.85)"
  }
});
