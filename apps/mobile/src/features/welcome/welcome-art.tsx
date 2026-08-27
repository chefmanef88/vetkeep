import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { fonts, hairline, palette, radius, shadowRaised, space } from "@/ui/tokens";

/**
 * The hero for each welcome slide.
 *
 * The reference designs put a rendered 3D object here — a wallet, a gift box, a
 * plane. Those exist to stand in for a product that is hard to photograph. This
 * product is not hard to show: it is a folder, a calculation and a document, and
 * a veterinarian deciding whether to trust it is better served by seeing the
 * real thing than a stylised parcel.
 *
 * So each hero is a miniature of an actual VetKeep surface, tilted and stacked
 * for depth the way the reference stacks its cards. It also cannot drift from
 * the product, because it is built from the same tokens the product is.
 *
 * Everything here is decorative: the screen reader gets the headline and body,
 * which say the same thing in words.
 */

function Card({
  children,
  tilt = 0,
  offsetX = 0,
  offsetY = 0,
  faded = false
}: {
  children?: React.ReactNode;
  tilt?: number;
  offsetX?: number;
  offsetY?: number;
  faded?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        shadowRaised,
        {
          transform: [{ rotate: `${tilt}deg` }, { translateX: offsetX }, { translateY: offsetY }],
          opacity: faded ? 0.55 : 1
        }
      ]}
    >
      {children}
    </View>
  );
}

/** What the client leaves with. */
export function CopyArt() {
  return (
    <View style={styles.stage} pointerEvents="none" accessible={false}>
      <Card tilt={5} offsetX={12} offsetY={14} faded />
      <Card tilt={-4}>
        <View style={styles.row}>
          <View style={[styles.avatar, styles.avatarSky]}>
            <Ionicons name="document-text" size={18} color="#2F6A8A" />
          </View>
          <View style={styles.grow}>
            <Text style={styles.name}>Consultation record</Text>
            <Text style={styles.meta}>Signed · 12 Aug 2026</Text>
          </View>
        </View>
        <View style={styles.rule} />
        <View style={styles.entry}>
          <Ionicons name="pricetag-outline" size={13} color={palette.quiet} />
          <Text style={styles.entryLabel}>Reference</Text>
          <Text style={styles.code}>VK-R-7K3M9T</Text>
        </View>
        <View style={styles.entry}>
          <Ionicons name="shield-checkmark-outline" size={13} color={palette.green} />
          <Text style={styles.entryLabel}>Passport link</Text>
          <Text style={styles.entryWhen}>shared</Text>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { height: 260, alignItems: "center", justifyContent: "center" },
  card: {
    position: "absolute",
    width: 268,
    backgroundColor: palette.surface,
    borderRadius: radius,
    padding: space.lg,
    gap: space.sm
  },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  grow: { flex: 1, gap: 1 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: palette.brandSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarSky: { backgroundColor: "#E2ECF2" },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: palette.ink },
  meta: { fontFamily: fonts.regular, fontSize: 12, color: palette.quiet },
  chipRow: { flexDirection: "row" },
  chip: {
    backgroundColor: palette.ground,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3
  },
  chipText: { fontFamily: fonts.mono, fontSize: 10, color: palette.quiet },
  rule: { height: hairline, backgroundColor: palette.line, marginVertical: 2 },
  entry: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.green },
  entryLabel: { flex: 1, fontFamily: fonts.regular, fontSize: 12.5, color: palette.ink },
  entryWhen: { fontFamily: fonts.regular, fontSize: 11.5, color: palette.quiet },
  hold: { fontFamily: fonts.semibold, fontSize: 11.5, color: palette.amber },
  code: { fontFamily: fonts.mono, fontSize: 11, color: palette.brandInk },
  kicker: { fontFamily: fonts.medium, fontSize: 12, color: palette.quiet },
  sum: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  sumBig: { fontFamily: fonts.bold, fontSize: 40, letterSpacing: -1.4, color: palette.ink },
  sumUnit: { fontFamily: fonts.semibold, fontSize: 17, color: palette.quiet },
  working: { fontFamily: fonts.mono, fontSize: 11, color: palette.quiet }
});
