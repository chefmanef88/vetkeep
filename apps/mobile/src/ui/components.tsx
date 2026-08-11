import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { hairline, palette, radiusControl, shadowCard, space, touchTarget, type } from "./tokens";

/**
 * The entry screens: sign in, authenticator, onboarding.
 *
 * Composed top-weighted rather than vertically centred. A centred stack floats
 * and rebalances every time the keyboard opens or an error line appears;
 * anchoring to the top keeps the title and the first field where the eye last
 * left them.
 */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.container}>{children}</View>
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

export function Field(props: TextInputProps) {
  return <TextInput style={styles.input} placeholderTextColor={palette.quiet} {...props} />;
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  tone = "brand"
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** "danger" for an action that destroys something. Never the default. */
  tone?: "brand" | "danger";
}) {
  const danger = tone === "danger";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        danger && styles.buttonDanger,
        pressed && !disabled && (danger ? styles.buttonDangerPressed : styles.buttonPressed),
        disabled && styles.disabled
      ]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

/**
 * Tinted rather than filled, so the two buttons never compete for the same
 * attention. Weight and fill, not colour alone, say which is the way forward.
 */
export function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryPressed]}
      onPress={onPress}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

/**
 * Marked by a solid rule down its edge as well as by colour, so the message
 * still reads as an alert in sunlight or to a red-green colourblind reader.
 */
export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <View accessibilityRole="alert" style={styles.errorBlock}>
      <Text style={styles.error}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.ground },
  container: {
    flex: 1,
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.xxl
  },
  title: { ...type.display, color: palette.ink, marginBottom: space.xs },
  body: { ...type.body, color: palette.quiet, marginBottom: space.sm },
  input: {
    backgroundColor: palette.surface,
    borderWidth: hairline,
    borderColor: palette.line,
    borderRadius: radiusControl,
    paddingHorizontal: space.lg,
    minHeight: touchTarget,
    ...type.body,
    color: palette.ink
  },
  button: {
    backgroundColor: palette.brand,
    borderRadius: radiusControl,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.sm,
    ...shadowCard
  },
  buttonPressed: { backgroundColor: palette.brandPressed },
  // Destructive actions do not borrow the brand colour. Reaching for the same
  // green as Save would make the two look interchangeable at a glance.
  buttonDanger: { backgroundColor: palette.red },
  buttonDangerPressed: { backgroundColor: "#6E1616" },
  disabled: { backgroundColor: palette.line, shadowOpacity: 0, elevation: 0 },
  buttonText: { ...type.action, color: palette.surface },
  secondaryButton: {
    backgroundColor: palette.brandSoft,
    borderWidth: hairline,
    borderColor: palette.line,
    borderRadius: radiusControl,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryPressed: { backgroundColor: palette.line },
  secondaryButtonText: { ...type.action, color: palette.brandInk },
  errorBlock: {
    borderLeftWidth: 3,
    borderLeftColor: palette.red,
    backgroundColor: palette.redSoft,
    borderRadius: radiusControl,
    paddingVertical: space.md,
    paddingHorizontal: space.lg
  },
  error: { ...type.small, fontFamily: type.strong.fontFamily, color: palette.red }
});
