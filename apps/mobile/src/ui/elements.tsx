import { Ionicons } from "@expo/vector-icons";
import { useState, type ReactNode } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps
} from "react-native";
import {
  fonts,
  hairline,
  palette,
  radius,
  radiusControl,
  radiusPill,
  shadowCard,
  space,
  touchTarget,
  type
} from "./tokens";

/**
 * Composition pieces, as distinct from the raw text and input primitives in
 * ./components. These exist because the screens were built out of nothing but
 * a titled box and a stack of labelled fields, which is why every one of them
 * read the same. An avatar, a chip and a collapsed section carry hierarchy that
 * a uniform stack cannot.
 *
 * Patterns follow GentlePaws: an icon chip in a tinted rounded square beside a
 * label/value pair, semantic tints drawn from one ramp, soft-lifted surfaces.
 */

export type Tone = "brand" | "good" | "warn" | "bad" | "neutral";

const toneFill: Record<Tone, string> = {
  brand: palette.brandSoft,
  good: palette.greenSoft,
  warn: palette.amberSoft,
  bad: palette.redSoft,
  neutral: palette.ground
};

const toneInk: Record<Tone, string> = {
  brand: palette.brandInk,
  good: palette.green,
  warn: palette.amber,
  bad: palette.red,
  neutral: palette.quiet
};

/**
 * Initials on a tinted disc. Gives a list of names a left edge the eye can run
 * down, which a column of plain text rows does not have.
 */
export function Avatar({
  name,
  tone = "brand",
  photoUri,
  size = 44
}: {
  name: string;
  tone?: Tone;
  /** A signed URL. Falls back to initials while absent, so a queued photograph
   *  taken in a field does not leave a broken image on the folder. */
  photoUri?: string | null | undefined;
  size?: number;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  const shape = { width: size, height: size, borderRadius: size / 2 };

  if (photoUri) {
    return (
      <Image
        source={{ uri: photoUri }}
        style={[styles.avatar, shape]}
        accessibilityLabel={`Photograph of ${name}`}
      />
    );
  }

  return (
    <View style={[styles.avatar, shape, { backgroundColor: toneFill[tone] }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.34, color: toneInk[tone] }]}>
        {initials || "?"}
      </Text>
    </View>
  );
}

/** An icon in a tinted rounded square. The GentlePaws StatCard treatment. */
export function IconChip({
  name,
  tone = "brand",
  size = 44
}: {
  name: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  size?: number;
}) {
  return (
    <View style={[styles.iconChip, { backgroundColor: toneFill[tone], width: size, height: size }]}>
      <Ionicons name={name} size={size * 0.5} color={toneInk[tone]} />
    </View>
  );
}

/** Short monospaced fact: a record code, a quantity. */
export function CodeChip({ children }: { children: ReactNode }) {
  return (
    <View style={styles.codeChip}>
      <Text style={styles.codeChipText}>{children}</Text>
    </View>
  );
}

/** Search with the magnifier inside the control, and a clear button once used. */
export function SearchField({
  value,
  onChangeText,
  placeholder
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
} & Pick<TextInputProps, "placeholder">) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={palette.quiet} />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.quiet}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText("")}
          hitSlop={10}
        >
          <Ionicons name="close-circle" size={18} color={palette.quiet} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * A list heading that sits on the page rather than inside a box, with the count
 * beside it. Puts the shape of the data in front of the vet before they read a
 * single row.
 */
export function ListHeader({ title, count }: { title: string; count?: number }) {
  return (
    <View style={styles.listHeader}>
      <Text style={styles.listHeaderText}>{title}</Text>
      {count === undefined ? null : (
        <View style={styles.countChip}>
          <Text style={styles.countChipText}>{count}</Text>
        </View>
      )}
    </View>
  );
}

/** A person or animal in a list: disc, name, supporting facts, chevron. */
export function PersonRow({
  name,
  meta,
  code,
  tone = "brand",
  photoUri,
  onPress
}: {
  name: string;
  meta?: string;
  code?: string;
  tone?: Tone;
  photoUri?: string | null | undefined;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.personRow, pressed && styles.pressed]}
      onPress={onPress}
    >
      <Avatar name={name} tone={tone} photoUri={photoUri} />
      <View style={styles.personBody}>
        <Text style={styles.personName} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.personMeta}>
          {code ? <CodeChip>{code}</CodeChip> : null}
          {meta ? (
            <Text style={styles.personMetaText} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.quiet} />
    </Pressable>
  );
}

/**
 * Nothing here yet, said with an icon and a sentence rather than a bare line of
 * grey text that reads like a failure.
 */
export function EmptyState({
  icon,
  title,
  hint
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint?: string;
}) {
  return (
    <View style={styles.empty}>
      <IconChip name={icon} tone="neutral" size={52} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

/**
 * A wrapping set of choices, for option lists too long for a segmented bar.
 *
 * Species runs to ten and purpose to six; squeezed into one row they become
 * unreadable and untappable. Wrapped chips keep every option visible at once,
 * which matters more than compactness when the choice determines what the rest
 * of the form asks.
 */
export function OptionChips<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (next: T) => void;
  accessibilityLabel?: string;
}) {
  return (
    <View style={styles.chipWrap} accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.choiceChip,
              selected && styles.choiceChipOn,
              pressed && styles.pressed
            ]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.choiceChipText, selected && styles.choiceChipTextOn]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A page title with supporting line, sitting on the ground, not in a box. */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.pageHeader}>
      <Text style={styles.pageTitle}>{title}</Text>
      {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

/**
 * A figure with its name and an icon, on a tinted ground. GentlePaws' StatCard.
 * Used where a number is the point: visits today, items waiting to sync.
 */
export function StatTile({
  icon,
  label,
  value,
  hint,
  tone = "brand",
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  onPress?: () => void;
}) {
  const body = (
    <>
      <IconChip name={icon} tone={tone} size={44} />
      <View style={styles.tileBody}>
        <Text style={styles.tileLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.tileValue, { color: toneInk[tone] }]}>{value}</Text>
        {hint ? (
          <Text style={styles.tileHint} numberOfLines={1}>
            {hint}
          </Text>
        ) : null}
      </View>
    </>
  );

  if (!onPress)
    return <View style={[styles.tile, { backgroundColor: toneFill[tone] }]}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: toneFill[tone] },
        pressed && styles.tilePressed
      ]}
      onPress={onPress}
    >
      {body}
    </Pressable>
  );
}

/** A destination in a grid: icon, name, and an optional count riding on it. */
export function NavTile({
  icon,
  label,
  badge,
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.navTile, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View>
        <IconChip name={icon} tone="brand" size={40} />
        {badge !== undefined && badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.navTileLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * One fact with its icon and, where it matters, a tone. Used for the things a
 * vet needs to see rather than act on: licence state, account standing.
 */
export function InfoRow({
  icon,
  label,
  value,
  tone = "neutral",
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  tone?: Tone;
  onPress?: () => void;
}) {
  const body = (
    <>
      <Ionicons name={icon} size={18} color={palette.quiet} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, { color: toneInk[tone] }]} numberOfLines={1}>
        {value}
      </Text>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={palette.quiet} /> : null}
    </>
  );

  if (!onPress) return <View style={styles.infoRow}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.infoRow, pressed && styles.pressed]}
      onPress={onPress}
    >
      {body}
    </Pressable>
  );
}

/**
 * A section that stays shut until it is wanted.
 *
 * The add-a-client form used to sit open permanently, taking most of the screen
 * below the list it was competing with. Collapsed, the list is the screen and
 * creating is a deliberate act.
 */
export function Collapsible({
  title,
  icon,
  children,
  hint,
  tone = "brand",
  initiallyOpen = false
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
  /** What is inside, said on the closed header: "4 of 6", "8 of 11 examined". */
  hint?: string;
  tone?: Tone;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={styles.collapsible}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.collapsibleHead, pressed && styles.pressed]}
        onPress={() => setOpen(!open)}
      >
        <IconChip name={icon} tone={tone} size={38} />
        <View style={styles.collapsibleTitles}>
          <Text style={styles.collapsibleTitle}>{title}</Text>
          {/* Stated on the closed header so a long consultation can be scanned
              for what is still outstanding without opening every section. */}
          {hint ? <Text style={styles.collapsibleHint}>{hint}</Text> : null}
        </View>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={palette.quiet} />
      </Pressable>
      {open ? <View style={styles.collapsibleBody}>{children}</View> : null}
    </View>
  );
}

/**
 * How much of something is done, as a bar and as words.
 *
 * The bar alone would be decoration; the count is the fact. Used for the
 * examination, where "3 of 11 examined" is the difference between a record that
 * can be signed and one that should not be.
 */
export function ProgressBar({
  done,
  total,
  label,
  tone = "brand"
}: {
  done: number;
  total: number;
  label: string;
  tone?: Tone;
}) {
  const fraction = total === 0 ? 0 : Math.min(1, Math.max(0, done / total));
  return (
    <View style={styles.progress}>
      <View style={styles.progressHead}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={[styles.progressCount, { color: toneInk[tone] }]}>
          {done} of {total}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${fraction * 100}%`, backgroundColor: toneInk[tone] }
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.ground
  },
  avatarText: { fontFamily: fonts.semibold },
  iconChip: { borderRadius: radiusControl, alignItems: "center", justifyContent: "center" },
  codeChip: {
    backgroundColor: palette.ground,
    borderRadius: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 2
  },
  codeChipText: { fontFamily: fonts.mono, fontSize: 11, color: palette.quiet },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: palette.surface,
    borderWidth: hairline,
    borderColor: palette.line,
    borderRadius: radiusPill,
    paddingHorizontal: space.lg,
    minHeight: touchTarget,
    ...shadowCard
  },
  searchInput: { flex: 1, ...type.body, color: palette.ink },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.xs,
    paddingTop: space.sm
  },
  listHeaderText: { fontFamily: fonts.semibold, fontSize: 13, color: palette.quiet },
  countChip: {
    backgroundColor: palette.line,
    borderRadius: radiusPill,
    paddingHorizontal: space.sm,
    minWidth: 22,
    alignItems: "center"
  },
  countChipText: { fontFamily: fonts.medium, fontSize: 11, color: palette.ink },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: palette.surface,
    borderBottomWidth: hairline,
    borderBottomColor: palette.line,
    minHeight: touchTarget + space.md
  },
  pressed: { backgroundColor: palette.brandSoft },
  personBody: { flex: 1, gap: space.xs },
  personName: { ...type.strong, color: palette.ink },
  personMeta: { flexDirection: "row", alignItems: "center", gap: space.sm },
  personMetaText: { ...type.small, color: palette.quiet, flexShrink: 1 },
  empty: { alignItems: "center", gap: space.sm, paddingVertical: space.xxl },
  emptyTitle: { ...type.strong, color: palette.ink },
  emptyHint: { ...type.small, color: palette.quiet, textAlign: "center" },
  collapsible: {
    backgroundColor: palette.surface,
    borderRadius: radius,
    borderWidth: hairline,
    borderColor: palette.line,
    overflow: "hidden",
    ...shadowCard
  },
  collapsibleHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
    minHeight: touchTarget
  },
  collapsibleTitles: { flex: 1, gap: 1 },
  collapsibleTitle: { ...type.strong, color: palette.ink },
  collapsibleHint: { fontFamily: fonts.regular, fontSize: 12, color: palette.quiet },
  progress: { gap: space.sm },
  progressHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressLabel: { ...type.small, color: palette.quiet },
  progressCount: { fontFamily: fonts.semibold, fontSize: 13 },
  progressTrack: {
    height: 6,
    borderRadius: radiusPill,
    backgroundColor: palette.line,
    overflow: "hidden"
  },
  progressFill: { height: 6, borderRadius: radiusPill },
  collapsibleBody: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.sm
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  choiceChip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radiusPill,
    borderWidth: hairline,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    minHeight: 40,
    justifyContent: "center"
  },
  choiceChipOn: { backgroundColor: palette.brand, borderColor: palette.brand },
  choiceChipText: { fontFamily: fonts.medium, fontSize: 14, color: palette.ink },
  choiceChipTextOn: { fontFamily: fonts.semibold, color: palette.surface },
  pageHeader: { gap: space.xs, paddingHorizontal: space.xs, paddingBottom: space.xs },
  pageTitle: { ...type.display, color: palette.ink },
  pageSubtitle: { ...type.body, color: palette.quiet },
  tile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
    borderRadius: radius,
    minHeight: 84
  },
  tilePressed: { opacity: 0.75 },
  tileBody: { flex: 1, gap: 1 },
  tileLabel: { ...type.small, color: palette.quiet },
  tileValue: { fontFamily: fonts.bold, fontSize: 24 },
  tileHint: { fontFamily: fonts.regular, fontSize: 11, color: palette.quiet },
  navTile: {
    flex: 1,
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.lg,
    paddingHorizontal: space.sm,
    backgroundColor: palette.surface,
    borderRadius: radius,
    borderWidth: hairline,
    borderColor: palette.line,
    minHeight: 96,
    justifyContent: "center",
    ...shadowCard
  },
  navTileLabel: { ...type.label, color: palette.ink, textAlign: "center" },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: palette.red,
    borderRadius: radiusPill,
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    alignItems: "center"
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11, color: palette.surface },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    minHeight: touchTarget - space.sm
  },
  infoLabel: { ...type.small, color: palette.quiet, flex: 1 },
  infoValue: { fontFamily: fonts.semibold, fontSize: 14 }
});
