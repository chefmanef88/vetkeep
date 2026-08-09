import { Ionicons } from "@expo/vector-icons";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
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
export function Avatar({ name, tone = "brand" }: { name: string; tone?: Tone }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <View style={[styles.avatar, { backgroundColor: toneFill[tone] }]}>
      <Text style={[styles.avatarText, { color: toneInk[tone] }]}>{initials || "?"}</Text>
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
  onPress
}: {
  name: string;
  meta?: string;
  code?: string;
  tone?: Tone;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.personRow, pressed && styles.pressed]}
      onPress={onPress}
    >
      <Avatar name={name} tone={tone} />
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
  initiallyOpen = false
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
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
        <IconChip name={icon} tone="brand" size={38} />
        <Text style={styles.collapsibleTitle}>{title}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={palette.quiet} />
      </Pressable>
      {open ? <View style={styles.collapsibleBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radiusPill,
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: { fontFamily: fonts.semibold, fontSize: 15 },
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
  collapsibleTitle: { ...type.strong, color: palette.ink, flex: 1 },
  collapsibleBody: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.sm
  }
});
