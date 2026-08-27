/**
 * Design tokens for the field interface.
 *
 * The shape of the interface follows GentlePaws — Geist, rounded-2xl surfaces,
 * the soft shadow-card lift, a 4pt spacing scale — so the two products feel
 * built by the same hand. The colour does not: VetKeep keeps its own deep
 * green, and the neutrals stay warm to sit under it.
 *
 * Where this diverges further, it is for the phone: touch targets are larger
 * than a cursor needs, and contrast is pushed a little harder because this
 * screen gets read outdoors in sun, one-handed, with the other hand on an
 * animal.
 */

export const palette = {
  /** Warm off-white. Cards sit on this, separated by shadow rather than a rule. */
  ground: "#F7F8F5",
  surface: "#FFFFFF",
  /** Near-black with green in it, so text sits in the same family as the brand. */
  ink: "#17211B",
  quiet: "#536159",
  line: "#DFE5DF",

  /**
   * VetKeep's own deep green, carried through from the original palette. The
   * neutrals above are warm rather than slate for the same reason: a blue-grey
   * ground under a deep green reads as two unrelated decisions.
   */
  brand: "#174D35",
  /** Darker, for pressed states. */
  brandPressed: "#0F3524",
  /** For text and icons on a pale brand fill. */
  brandInk: "#174D35",
  brandSoft: "#E8EEE9",

  /**
   * Success, kept deliberately brighter than the brand. Both are green, so if
   * they were the same weight a "started" visit and an ordinary one would be
   * indistinguishable at a glance.
   */
  green: "#2F7D4F",
  greenSoft: "#E6F2EA",

  amber: "#8A5209",
  amberSoft: "#FDF6EA",
  red: "#8F1D1D",
  redSoft: "#FBE0E0"
} as const;

/** A 4pt grid. Matches Tailwind's spacing scale, which the web app uses. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48
} as const;

/** rounded-2xl on cards, slightly tighter on controls so they read as crisper. */
export const radius = 16;
export const radiusControl = 12;
export const radiusPill = 999;
export const hairline = 1;

/**
 * GentlePaws' shadow-card, translated. React Native needs elevation for Android
 * and the shadow* family for iOS, so both are set and kept in step.
 */
export const shadowCard = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2
} as const;

/** Deeper, for anything that floats above the page. */
export const shadowRaised = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.1,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 8 },
  elevation: 6
} as const;

/**
 * Minimum height for anything tappable. Above the 44 floor because this is
 * used with wet or gloved hands.
 */
export const touchTarget = 52;

export const fonts = {
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  bold: "Geist_700Bold",
  mono: "GeistMono_400Regular"
} as const;

/**
 * Weight is carried by the loaded font family, not by fontWeight: on Android a
 * numeric weight against a custom family is ignored, which silently renders
 * everything at regular.
 */
export const type = {
  display: { fontFamily: fonts.bold, fontSize: 30, letterSpacing: -0.6 },
  heading: { fontFamily: fonts.semibold, fontSize: 20, letterSpacing: -0.3 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  strong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  /** field-label: text-sm font-medium. */
  label: { fontFamily: fonts.medium, fontSize: 13 },
  action: { fontFamily: fonts.semibold, fontSize: 15 },
  /**
   * Bigger and tighter than `display`, for the welcome flow only.
   *
   * The reference designs set their headline around 60px with -1.5px tracking
   * on a desktop hero; scaled to a 390pt phone that lands near 34. Tracking
   * tightens with size because letterspacing that reads as confident at 34
   * reads as cramped at 20, which is why this is its own entry rather than a
   * larger `display`.
   */
  hero: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 39, letterSpacing: -1 },
  heroLead: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 }
} as const;

/**
 * The washes behind the welcome slides.
 *
 * Every set resolves to VetKeep's green or a warm neighbour of it, so the app
 * that follows is recognisably the same product. The reference designs vary the
 * hue per screen — pink, then peach, then sky — and that variation is worth
 * keeping: it makes a three-screen sequence feel like it is going somewhere.
 * What is not worth keeping is their saturation, on a tool that is also opened
 * in a farmyard at midday.
 *
 * Ordered light to dark so a gradient reads as depth rather than as a stripe.
 */
export const washes = {
  /** Deep green through to the ground colour. The folder, the core idea. */
  brand: ["#E4EFE6", "#F2F6F1", "#F7F8F5"],
  /** Warm, for the dose and the withholding dates: numbers that carry weight. */
  amber: ["#FBEEDA", "#F8F3E9", "#F7F8F5"],
  /** Cool, for the client's copy leaving the practice. */
  sky: ["#E2ECF2", "#F0F4F5", "#F7F8F5"]
} as const;

export type WashName = keyof typeof washes;

/**
 * The blurred colour blob sitting behind the hero art.
 *
 * React Native has no CSS filter, so the reference's `blur-3xl` is built from
 * expo-blur over a saturated circle rather than from a blurred gradient. These
 * are the circle colours: stronger than the wash they sit on, because the blur
 * that softens them also drains them.
 */
export const blobs = {
  brand: "#8FBF9F",
  amber: "#E9B972",
  sky: "#8FB6CC"
} as const;
