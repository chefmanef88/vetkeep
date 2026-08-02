import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

/**
 * Screens a veterinarian uses in the field, standing in someone's yard with one
 * hand on the animal. Everything here scrolls, targets are large, and nothing
 * relies on colour alone to carry meaning.
 */

export const palette = {
  ground: "#f7f8f5",
  surface: "#ffffff",
  ink: "#17211b",
  quiet: "#536159",
  line: "#dfe5df",
  green: "#174d35",
  greenSoft: "#e8eee9",
  amber: "#8a5209",
  amberSoft: "#fdf6ea",
  red: "#8f1d1d",
  redSoft: "#fbe0e0"
};

export function ScrollScreen({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
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

export function Mono({ children }: { children: ReactNode }) {
  return <Text style={styles.mono}>{children}</Text>;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export type PillTone = "neutral" | "good" | "warn" | "bad";

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
  scrollContent: { padding: 16, gap: 14, paddingBottom: 48 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 16,
    gap: 10
  },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: palette.ink },
  muted: { fontSize: 14, color: palette.quiet, lineHeight: 20 },
  mono: { fontSize: 13, color: palette.quiet, fontVariant: ["tabular-nums"] },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: palette.ink },
  pill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    minHeight: 56
  },
  rowPressed: { opacity: 0.6 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: "700", color: palette.ink },
  segmented: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
    overflow: "hidden"
  },
  segment: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    minHeight: 44
  },
  segmentSelected: { backgroundColor: palette.green },
  segmentWarn: { backgroundColor: palette.amber },
  segmentText: { fontSize: 12, fontWeight: "700", color: palette.quiet },
  segmentTextSelected: { color: "#ffffff" }
});

const pillTone = StyleSheet.create({
  neutral: { backgroundColor: palette.greenSoft },
  good: { backgroundColor: "#d6ede0" },
  warn: { backgroundColor: palette.amberSoft },
  bad: { backgroundColor: palette.redSoft }
});

const pillTextTone = StyleSheet.create({
  neutral: { color: "#3d4f44" },
  good: { color: "#14532d" },
  warn: { color: palette.amber },
  bad: { color: palette.red }
});
