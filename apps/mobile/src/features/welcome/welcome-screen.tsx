import { useEffect, useRef, useState } from "react";
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
import { CopyArt } from "./welcome-art";
import { PhotoHero } from "./photo-hero";
// Imported rather than require()d: Metro resolves both, expo/types declares the
// module shape, and the lint rule that forbids require applies to asset loading
// as much as to code.
import farmVisit from "../../../assets/welcome/farm-visit.jpg";
import homeVisit from "../../../assets/welcome/home-visit.jpg";
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

/**
 * Two photographs, then the product.
 *
 * The first two slides are the work — a house call and a farm visit — because
 * nobody became a veterinarian to use software, and a stranger will not read a
 * screenshot before they have been given a reason to care. The third is the
 * document itself, which is the one thing here that is genuinely about the
 * application rather than the day.
 *
 * The cow is on the withholding slide deliberately. Milk and meat withdrawal is
 * a food-animal problem, and a dairy cow with an ear tag is the exact case the
 * calculation exists for — the card on the photograph states the consequence
 * rather than describing the feature.
 */
const SLIDES: Slide[] = [
  {
    wash: "brand",
    art: () => (
      <PhotoHero source={homeVisit} caption="Record started" detail="VK-R-7K3M9T · 12 Aug" />
    ),
    headline: "A folder for every animal",
    lead: "Standing details that stay editable, and every consultation kept beneath them in date order — the same way a paper file works, without the paper."
  },
  {
    wash: "amber",
    art: () => (
      <PhotoHero
        source={farmVisit}
        caption="Milk safe from 19 August"
        detail="Oxytetracycline · 18.5 ml"
      />
    ),
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

  // Pages are laid out at the current width, so a width change leaves the
  // scroll offset pointing between two of them: the dots said slide one while
  // slide three was on screen. Rotating, unfolding, or entering split screen
  // all do this. Re-anchoring on width alone — the index comes from a ref so a
  // swipe does not fight the scroll it just performed.
  // Written where the page actually changes rather than during render, which
  // is why this is not simply `settledIndex.current = index`.
  const settledIndex = useRef(0);
  useEffect(() => {
    scroller.current?.scrollTo({ x: settledIndex.current * width, animated: false });
  }, [width]);

  const last = index === SLIDES.length - 1;
  const slide = SLIDES[index] ?? SLIDES[0];
  if (!slide) return null;

  function goTo(next: number, animated: boolean) {
    settledIndex.current = next;
    setIndex(next);
    scroller.current?.scrollTo({ x: next * width, animated });
  }

  function settled(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next === index) return;
    // The scroll already happened — record it without scrolling again.
    settledIndex.current = next;
    setIndex(next);
  }

  function advance() {
    if (last) {
      onDone();
      return;
    }
    goTo(index + 1, true);
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
        // flexGrow lets each page take the full height so its content can be
        // centred in it. Without it the pages are only as tall as their content
        // and everything piles against the status bar.
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + space.lg }}
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
  /** Centred in the page rather than stacked from the top: at the shortest
      supported height the two still fit, and on a tall phone the pair sits as a
      block instead of leaving a hole above the controls. */
  page: { flex: 1, justifyContent: "center", paddingHorizontal: space.xl, gap: space.xl },
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
