import { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Wash } from "@/ui/wash";
import { CopyArt, DoseArt, FolderArt } from "./welcome-art";
import {
  fonts,
  palette,
  radiusPill,
  shadowCard,
  space,
  touchTarget,
  type,
  type WashName
} from "@/ui/tokens";

/**
 * What a veterinarian sees before they are asked for an email address.
 *
 * Every claim on these three screens is one the application actually keeps.
 * That is a deliberate constraint rather than modesty: the two things it would
 * be most tempting to promise here — that records can be made without a signal,
 * and that reminders reach clients on their own — are the two this build does
 * not do yet. A vet who trusts either one and finds out in a farmyard has been
 * misled by the welcome screen, which is a worse first impression than a plainer
 * one would have been.
 */

type Slide = {
  wash: WashName;
  art: () => React.JSX.Element;
  headline: string;
  lead: string;
};

const SLIDES: Slide[] = [
  {
    wash: "brand",
    art: FolderArt,
    headline: "A folder for every animal",
    lead: "Standing details that stay editable, and every consultation kept beneath them in date order — the same way a paper file works, without the paper."
  },
  {
    wash: "amber",
    art: DoseArt,
    headline: "The dose, and the dates it commits you to",
    lead: "Enter the weight and the volume is worked out, with the working shown. Withholding periods for milk, meat and eggs are calculated with it, as dates rather than a number of days to count forward."
  },
  {
    wash: "sky",
    art: CopyArt,
    headline: "A copy they can keep",
    lead: "Every consultation carries a reference you and the owner can both name, and a passport link that proves vaccination to a buyer without opening the rest of the file."
  }
];

export function WelcomeScreen({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const last = index === SLIDES.length - 1;
  const slide = SLIDES[index] ?? SLIDES[0];
  if (!slide) return null;

  function settled(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(next);
  }

  function advance() {
    if (last) {
      onDone();
      return;
    }
    const next = index + 1;
    setIndex(next);
    scroller.current?.scrollTo({ x: next * width, animated: true });
  }

  return (
    <View style={styles.screen}>
      {/* Behind everything, and keyed to the slide so the colour travels with
          the swipe rather than snapping when it settles. */}
      <Wash name={slide.wash} diameter={320} offsetY={-90} />

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={settled}
        style={styles.pager}
        contentContainerStyle={{ paddingTop: insets.top + space.xxl }}
      >
        {SLIDES.map((entry) => {
          const Art = entry.art;
          return (
            <View key={entry.headline} style={[styles.page, { width }]}>
              <Art />
              <View style={styles.copy}>
                <Text style={styles.headline}>{entry.headline}</Text>
                <Text style={styles.lead}>{entry.lead}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.foot, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.dots} accessibilityRole="progressbar">
          {SLIDES.map((entry, position) => (
            <View key={entry.headline} style={[styles.dot, position === index && styles.dotOn]} />
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.primary, shadowCard, pressed && styles.pressed]}
          onPress={advance}
        >
          <Text style={styles.primaryLabel}>{last ? "Get started" : "Continue"}</Text>
        </Pressable>

        {/* Kept on the last slide, where it does the same thing as the primary.
            Removing it there would move a control the thumb is already resting
            on, at the one moment the sequence is about to end. */}
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
          onPress={onDone}
        >
          <Text style={styles.skipLabel}>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.ground },
  pager: { flex: 1 },
  page: { paddingHorizontal: space.xl, gap: space.xl },
  copy: { gap: space.md },
  headline: { ...type.hero, color: palette.ink },
  lead: { ...type.heroLead, color: palette.quiet },
  foot: { paddingHorizontal: space.xl, gap: space.md },
  dots: { flexDirection: "row", gap: 6, justifyContent: "center", paddingBottom: space.sm },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.line
  },
  /** The active dot lengthens rather than only changing colour, so progress is
      legible without relying on the difference between two greens. */
  dotOn: { width: 20, backgroundColor: palette.brand },
  primary: {
    minHeight: touchTarget,
    borderRadius: radiusPill,
    backgroundColor: palette.brand,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryLabel: { fontFamily: fonts.semibold, fontSize: 16, color: palette.surface },
  skip: {
    minHeight: touchTarget,
    borderRadius: radiusPill,
    alignItems: "center",
    justifyContent: "center"
  },
  skipLabel: { fontFamily: fonts.medium, fontSize: 15, color: palette.quiet },
  pressed: { opacity: 0.85 }
});
