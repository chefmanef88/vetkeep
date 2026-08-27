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

/** A folder: the animal, its code, and the records stacked beneath it. */
export function FolderArt() {
  return (
    <View style={styles.stage} pointerEvents="none" accessible={false}>
      {/* Two behind, to say "and the visits before this one". */}
      <Card tilt={-8} offsetX={-18} offsetY={16} faded />
      <Card tilt={5} offsetX={16} offsetY={8} faded />
      <Card tilt={-2}>
        <View style={styles.row}>
          <View style={styles.avatar}>
            <Ionicons name="paw" size={18} color={palette.brand} />
          </View>
          <View style={styles.grow}>
            <Text style={styles.name}>Asante&rsquo;s herd</Text>
            <Text style={styles.meta}>Cattle · 42 head</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>VK-P-4QT6R2</Text>
          </View>
        </View>
        <View style={styles.rule} />
        {[
          { label: "Mastitis, quarter left fore", when: "12 Aug" },
          { label: "Routine herd check", when: "3 Jul" }
        ].map((entry) => (
          <View key={entry.label} style={styles.entry}>
            <View style={styles.dot} />
            <Text style={styles.entryLabel} numberOfLines={1}>
              {entry.label}
            </Text>
            <Text style={styles.entryWhen}>{entry.when}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

/** The dose worked out, and the dates it commits the farmer to. */
export function DoseArt() {
  return (
    <View style={styles.stage} pointerEvents="none" accessible={false}>
      <Card tilt={6} offsetX={20} offsetY={18} faded />
      <Card tilt={-3}>
        <Text style={styles.kicker}>Oxytetracycline 20%</Text>
        <View style={styles.sum}>
          <Text style={styles.sumBig}>18.5</Text>
          <Text style={styles.sumUnit}>ml</Text>
        </View>
        <Text style={styles.working}>420 kg × 8.8 mg/kg ÷ 200 mg/ml</Text>
        <View style={styles.rule} />
        {[
          { icon: "water-outline" as const, label: "Milk", when: "safe 19 Aug" },
          { icon: "restaurant-outline" as const, label: "Meat", when: "safe 8 Sep" }
        ].map((hold) => (
          <View key={hold.label} style={styles.entry}>
            <Ionicons name={hold.icon} size={13} color={palette.amber} />
            <Text style={styles.entryLabel}>{hold.label}</Text>
            <Text style={styles.hold}>{hold.when}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

/** What the client leaves with. */
export function CopyArt() {
  return (
    <View style={styles.stage} pointerEvents="none" accessible={false}>
      <Card tilt={7} offsetX={22} offsetY={20} faded />
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
