import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { MenuButton } from "./app-menu";
import { hairline, palette, radiusPill, space, touchTarget, type } from "./tokens";

/**
 * The bar across the top of every tab screen: menu on the left, actions on the
 * right.
 *
 * The tab screens draw this themselves rather than using a navigator header,
 * because the two edges carry different kinds of thing. The menu is the same
 * everywhere and belongs to the application; the right-hand side belongs to the
 * screen, and on a list that is search while on the home screen it is the way
 * into searching everything. A navigator header would have made both of those
 * one shared configuration and the screens would have fought over it.
 */
export function ScreenTopBar({
  title,
  action
}: {
  /** Optional: home says good morning instead, in a heading below this. */
  title?: string;
  action?: React.JSX.Element;
}) {
  return (
    <View style={styles.bar}>
      {/* Negative margin so the icon's own padding does not push it off the
          page's left edge — the glyph lines up with the text below it. */}
      <View style={styles.lead}>
        <MenuButton />
      </View>

      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.spacer} />
      )}

      <View style={styles.trail}>{action}</View>
    </View>
  );
}

/**
 * A round search control, sized for a wet or gloved hand.
 *
 * An icon rather than a labelled button because it sits on every tab and the
 * magnifier is the one icon nobody has to learn. It carries an accessibility
 * label so that saying nothing on screen does not mean saying nothing at all.
 */
export function SearchAction({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Search clients and animals"
      onPress={onPress}
      hitSlop={space.sm}
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
    >
      <Ionicons name="search" size={20} color={palette.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: touchTarget
  },
  lead: { marginLeft: -space.sm },
  spacer: { flex: 1 },
  title: { ...type.heading, color: palette.ink, flex: 1 },
  trail: { marginLeft: "auto" },
  action: {
    width: touchTarget - 8,
    height: touchTarget - 8,
    borderRadius: radiusPill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderWidth: hairline,
    borderColor: palette.line
  },
  actionPressed: { backgroundColor: palette.greenSoft, borderColor: palette.greenSoft }
});
