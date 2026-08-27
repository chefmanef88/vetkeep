import { LinearGradient } from "expo-linear-gradient";
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { fonts, palette, radius, shadowRaised, space } from "@/ui/tokens";

/**
 * A photograph as the hero, with a piece of the product resting on it.
 *
 * The other three heroes are miniatures of VetKeep's own surfaces, which is the
 * right answer for explaining what the application does. It is the wrong answer
 * for the first thing a stranger sees: a folder is not why anyone became a
 * veterinarian, and a screen full of interface asks the reader to care about
 * software before they have been given a reason to.
 *
 * A photograph of the work does that in one glance, and the card over it says
 * the software is present without making it the subject.
 *
 * The scrim is not decoration. Photographs vary — this one may be replaced —
 * and a card laid directly on an unknown image is legible or not depending on
 * what happens to be behind it. Darkening the lower third means the card is
 * readable whatever the picture is.
 */
export function PhotoHero({
  source,
  caption,
  detail
}: {
  source: ImageSourcePropType;
  caption: string;
  detail: string;
}) {
  return (
    <View style={styles.stage} accessible={false}>
      <View style={[styles.frame, shadowRaised]}>
        <Image
          source={source}
          style={styles.photo}
          resizeMode="cover"
          // Decorative: the headline and body beside it carry the meaning, and
          // a screen reader announcing a stock photograph adds nothing.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <LinearGradient
          colors={["rgba(23,33,27,0)", "rgba(23,33,27,0.55)"]}
          style={styles.scrim}
          pointerEvents="none"
        />
      </View>

      <View style={[styles.card, shadowRaised]}>
        <View style={styles.tick}>
          <Ionicons name="checkmark" size={13} color={palette.surface} />
        </View>
        <View style={styles.grow}>
          <Text style={styles.caption} numberOfLines={1}>
            {caption}
          </Text>
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { height: 260, alignItems: "center", justifyContent: "center" },
  frame: {
    width: 286,
    height: 214,
    borderRadius: radius,
    overflow: "hidden",
    backgroundColor: palette.brandSoft
  },
  photo: { width: "100%", height: "100%" },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 96 },
  card: {
    position: "absolute",
    bottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    width: 226,
    backgroundColor: palette.surface,
    borderRadius: 14,
    paddingHorizontal: space.md,
    paddingVertical: space.sm
  },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.green,
    alignItems: "center",
    justifyContent: "center"
  },
  grow: { flex: 1, gap: 1 },
  caption: { fontFamily: fonts.semibold, fontSize: 13.5, color: palette.ink },
  detail: { fontFamily: fonts.regular, fontSize: 11.5, color: palette.quiet }
});
