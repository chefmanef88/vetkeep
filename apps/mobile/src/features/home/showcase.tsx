import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import farmVisit from "../../../assets/welcome/farm-visit.jpg";
import homeVisit from "../../../assets/welcome/home-visit.jpg";
import { fonts, hairline, palette, radius, radiusPill, shadowCard, space, type } from "@/ui/tokens";

/**
 * The band across the middle of the home screen.
 *
 * It loops without end, which is what was asked for, and it is the one place in
 * the application reserved for something other than the vet's own records —
 * including, later, a paid message. The shape of a slide is a union rather than
 * a single card so that adding a sponsor is a change to the data below and not
 * to this file.
 *
 * Two constraints shaped it:
 *
 * Every claim made here has to be one the application actually keeps, which is
 * the same rule the welcome screens follow. It would be easy to promise
 * reminders that reach clients on their own, and a vet who believed it and found
 * out in a farmyard would have been misled by the home screen.
 *
 * And it stops moving when it should. It pauses while a finger is on it, so it
 * cannot slide out from under someone mid-read, and it does not advance at all
 * for anyone who has asked their phone to reduce motion — an endless carousel
 * is close to the top of the list of things that setting exists for.
 */

const ADVANCE_MS = 6000;

type Slide =
  | {
      kind: "photo";
      key: string;
      source: ImageSourcePropType;
      headline: string;
      lead: string;
    }
  | {
      kind: "sponsor";
      key: string;
      headline: string;
      lead: string;
      /** Shown on the chip. Named so a reader knows who paid for the space. */
      sponsor: string;
      onPress?: () => void;
    };

/**
 * What the band shows today.
 *
 * Both photographs are already in the application — they are the two the
 * welcome screens use — so this costs the bundle nothing. A sponsor slide is
 * added by putting one in this list; nothing else has to change. A moving
 * advertisement would need expo-video and a hosted file, and is deliberately
 * not here yet: there is no content for it, and a video loop in a clinical
 * record is a decision to take with a real advertiser rather than a placeholder.
 */
export const SHOWCASE: Slide[] = [
  {
    kind: "photo",
    key: "folder",
    source: homeVisit,
    headline: "A folder for every animal",
    lead: "Standing details, and every consultation beneath them in date order."
  },
  {
    kind: "photo",
    key: "dose",
    source: farmVisit,
    headline: "The dose, and the dates it commits you to",
    lead: "Withholding for milk, meat and eggs worked out as dates."
  }
];

export function Showcase({ slides = SHOWCASE }: { slides?: Slide[] }) {
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (!cancelled) setReduceMotion(on);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => {
      setReduceMotion(on);
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    // Nothing to advance to, nowhere to advance in, or a reason not to.
    if (slides.length < 2 || width === 0 || held || reduceMotion) return;

    const timer = setInterval(() => {
      setIndex((current) => {
        // Wraps rather than stopping at the end: "a loop that never ends".
        const next = (current + 1) % slides.length;
        scroller.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, ADVANCE_MS);

    return () => clearInterval(timer);
  }, [slides.length, width, held, reduceMotion]);

  function onLayout(event: LayoutChangeEvent) {
    // Measured rather than taken from the window, so the band does not have to
    // know what padding the page around it uses.
    setWidth(event.nativeEvent.layout.width);
  }

  function onMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width === 0) return;
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  if (slides.length === 0) return null;

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        // A finger on the band stops it moving; letting go starts it again.
        onScrollBeginDrag={() => setHeld(true)}
        onScrollEndDrag={() => setHeld(false)}
        scrollEventThrottle={16}
      >
        {slides.map((slide) =>
          width === 0 ? null : (
            <View key={slide.key} style={{ width }}>
              {slide.kind === "photo" ? (
                <PhotoSlide slide={slide} />
              ) : (
                <SponsorSlide slide={slide} />
              )}
            </View>
          )
        )}
      </ScrollView>

      {slides.length > 1 ? (
        <View style={styles.dots}>
          {slides.map((slide, position) => (
            <View key={slide.key} style={[styles.dot, position === index ? styles.dotOn : null]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PhotoSlide({ slide }: { slide: Extract<Slide, { kind: "photo" }> }) {
  return (
    <View style={[styles.card, shadowCard]}>
      <Image source={slide.source} style={styles.photo} resizeMode="cover" accessible={false} />
      {/* Dark at the foot only. The text has to hold against a photograph taken
          outdoors, and a scrim across the whole frame would flatten the picture
          it is there to show. */}
      <LinearGradient
        colors={["rgba(23,33,27,0)", "rgba(23,33,27,0.35)", "rgba(23,33,27,0.82)"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.copy}>
        <Text style={styles.headline}>{slide.headline}</Text>
        <Text style={styles.lead} numberOfLines={2}>
          {slide.lead}
        </Text>
      </View>
    </View>
  );
}

function SponsorSlide({ slide }: { slide: Extract<Slide, { kind: "sponsor" }> }) {
  const body = (
    <View style={[styles.card, styles.sponsorCard, shadowCard]}>
      {/* Labelled, always. A paid message in a clinical record that is not
          marked as one is the sort of thing that costs a product its
          credibility, and the vet is the one who would carry that. */}
      <View style={styles.sponsorChip}>
        <Text style={styles.sponsorChipText}>Sponsored · {slide.sponsor}</Text>
      </View>
      <View style={styles.sponsorBody}>
        <Text style={styles.sponsorHeadline}>{slide.headline}</Text>
        <Text style={styles.sponsorLead} numberOfLines={3}>
          {slide.lead}
        </Text>
      </View>
    </View>
  );

  if (!slide.onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={slide.onPress}>
      {body}
    </Pressable>
  );
}

const HEIGHT = 196;

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  card: {
    height: HEIGHT,
    borderRadius: radius,
    overflow: "hidden",
    backgroundColor: palette.surface
  },
  photo: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  copy: { marginTop: "auto", padding: space.lg, gap: 2 },
  headline: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 25, color: "#FFFFFF" },
  lead: { ...type.small, color: "rgba(255,255,255,0.88)" },

  sponsorCard: {
    borderWidth: hairline,
    borderColor: palette.line,
    justifyContent: "space-between",
    padding: space.lg
  },
  sponsorChip: {
    alignSelf: "flex-start",
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radiusPill,
    backgroundColor: palette.greenSoft
  },
  sponsorChipText: { ...type.label, color: palette.green },
  sponsorBody: { gap: space.xs },
  sponsorHeadline: { ...type.heading, color: palette.ink },
  sponsorLead: { ...type.small, color: palette.quiet },

  dots: { flexDirection: "row", gap: space.xs, justifyContent: "center" },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radiusPill,
    backgroundColor: palette.line
  },
  dotOn: { backgroundColor: palette.green, width: 18 }
});
