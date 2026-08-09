/**
 * Design tokens for the field interface.
 *
 * These are taken from the GentlePaws app so the two products read as one
 * practice rather than two unrelated tools: the same sky-blue brand ramp, the
 * same Geist typeface, the same soft card treatment. Values below map directly
 * onto that Tailwind theme — brand.500, accent.500, slate neutrals, rounded-2xl,
 * shadow-card — so a change there has an obvious counterpart here.
 *
 * Where this diverges, it is for the phone: touch targets are larger than a
 * cursor needs, and contrast is pushed a little harder because this screen gets
 * read outdoors in sun, one-handed, with the other hand on an animal.
 */

export const palette = {
  /** slate-50. Cards sit on this, white on near-white, separated by shadow. */
  ground: "#F8FAFC",
  surface: "#FFFFFF",
  /** slate-800, the body colour GentlePaws sets on <body>. */
  ink: "#1E293B",
  /** slate-500. */
  quiet: "#64748B",
  /** slate-200, a touch stronger than the web's slate-100 border for sunlight. */
  line: "#E2E8F0",

  /** brand.500 — the primary sky blue. */
  brand: "#0EA5E9",
  /** brand.600, for pressed states. */
  brandPressed: "#0284C7",
  /** brand.700, for text on pale brand fills. */
  brandInk: "#0369A1",
  /** brand.50. */
  brandSoft: "#F0F9FF",

  /**
   * Kept as `green` because screens already reference it by that name. It is
   * now accent.600 from GentlePaws rather than the old VetKeep green.
   */
  green: "#16A34A",
  /** accent.50. */
  greenSoft: "#F0FDF4",

  /** emergency.yellow / a warmer amber for warnings. */
  amber: "#CA8A04",
  amberSoft: "#FEFCE8",
  /** emergency.red. */
  red: "#DC2626",
  redSoft: "#FEF2F2"
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
  action: { fontFamily: fonts.semibold, fontSize: 15 }
} as const;
