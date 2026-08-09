import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
 * Screens a veterinarian uses in the field, standing in someone's yard with one
 * hand on the animal. Everything here scrolls, targets are large, and nothing
 * relies on colour alone to carry meaning.
 *
 * The surface treatment follows GentlePaws: white cards on slate-50, rounded,
 * lifted by a soft shadow rather than outlined by a hard border. See ./tokens.
 */

export { palette } from "./tokens";

/**
 * The practice screens sit under a navigation header, which already accounts
 * for the status bar, so the top inset is off by default: claiming it there
 * would indent the first block twice. Screens routed without a header pass
 * topInset, or their first line hides behind the notch.
 */
export function ScrollScreen({
  children,
  topInset = false
}: {
  children: ReactNode;
  topInset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.scrollContent,
        topInset ? { paddingTop: insets.top + space.lg } : null,
        { paddingBottom: insets.bottom + space.xxxl }
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

/**
 * Record codes, quantities, doses. Geist Mono, so digits align down a column
 * and a transposed number shows up as a broken edge.
 */
export function Mono({ children }: { children: ReactNode }) {
  return <Text style={styles.mono}>{children}</Text>;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export type PillTone = "neutral" | "good" | "warn" | "bad";

/**
 * The label always states the condition in words, so the tone only reinforces
 * what the text already says.
 */
export function Pill({ label, tone = "neutral" }: { label: string; tone?: PillTone }) {
  return (
    <View style={[styles.pill, pillTone[tone]]}>
      <Text style={[styles.pillText, pillTextTone[tone]]}>{label}</Text>
    </View>
  );
}

export function RowButton({
  title,
  subtitle,
  meta,
  onPress
}: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
      </View>
      {meta}
    </Pressable>
  );
}

/**
 * A segmented control. Used for the examination systems, where the four states
 * must all be visible at once rather than hidden behind a picker: a vet has to
 * see at a glance which systems are still unexamined.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel
}: {
  options: { value: T; label: string; tone?: PillTone }[];
  value: T;
  onChange: (next: T) => void;
  accessibilityLabel?: string;
}) {
  return (
    <View style={styles.segmented} accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[
              styles.segment,
              selected && styles.segmentSelected,
              selected && option.tone === "warn" && styles.segmentWarn
            ]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: palette.ground },
  scrollContent: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius,
    borderWidth: hairline,
    borderColor: palette.line,
    padding: space.lg,
    gap: space.md,
    ...shadowCard
  },
  sectionTitle: { ...type.heading, color: palette.ink },
  muted: { ...type.small, color: palette.quiet },
  mono: { fontFamily: fonts.mono, fontSize: 13, color: palette.quiet },
  fieldLabel: { ...type.label, color: palette.ink, marginBottom: -space.xs },
  pill: {
    alignSelf: "flex-start",
    borderRadius: radiusPill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs
  },
  pillText: { fontFamily: fonts.semibold, fontSize: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: hairline,
    borderBottomColor: palette.line,
    minHeight: touchTarget + space.sm
  },
  rowPressed: { backgroundColor: palette.ground },
  rowBody: { flex: 1, gap: space.xs },
  rowTitle: { ...type.strong, color: palette.ink },
  segmented: {
    flexDirection: "row",
    gap: space.sm
  },
  // Separate rounded buttons rather than one divided bar: at four options the
  // bar crushes the labels, and these stay legible and individually tappable.
  segment: {
    flex: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderWidth: hairline,
    borderColor: palette.line,
    borderRadius: radiusControl,
    minHeight: touchTarget - space.sm
  },
  segmentSelected: { backgroundColor: palette.brand, borderColor: palette.brand },
  segmentWarn: { backgroundColor: palette.amber, borderColor: palette.amber },
  segmentText: { fontFamily: fonts.medium, fontSize: 12, color: palette.quiet },
  segmentTextSelected: { fontFamily: fonts.semibold, color: palette.surface },
  scrollSpacer: { height: space.xxxl }
});

const pillTone = StyleSheet.create({
  neutral: { backgroundColor: palette.brandSoft },
  good: { backgroundColor: palette.greenSoft },
  warn: { backgroundColor: palette.amberSoft },
  bad: { backgroundColor: palette.redSoft }
});

const pillTextTone = StyleSheet.create({
  neutral: { color: palette.brandInk },
  good: { color: palette.green },
  warn: { color: palette.amber },
  bad: { color: palette.red }
});
