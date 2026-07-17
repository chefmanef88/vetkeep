import type { ReactNode } from "react";
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps
} from "react-native";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
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
  return <TextInput style={styles.input} placeholderTextColor="#77837b" {...props} />;
}
export function PrimaryButton({
  label,
  onPress,
  disabled = false
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.button, disabled && styles.disabled]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}
export function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.secondaryButton} onPress={onPress}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}
export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f8f5" },
  container: { flex: 1, justifyContent: "center", gap: 14, padding: 24 },
  title: { fontSize: 28, fontWeight: "800", color: "#17211b" },
  body: { fontSize: 16, lineHeight: 23, color: "#536159" },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#bcc6be",
    borderRadius: 12,
    padding: 14,
    color: "#17211b"
  },
  button: { backgroundColor: "#174d35", borderRadius: 12, padding: 15, alignItems: "center" },
  disabled: { opacity: 0.5 },
  buttonText: { color: "white", fontWeight: "800" },
  secondaryButton: {
    backgroundColor: "#e8eee9",
    borderRadius: 12,
    padding: 15,
    alignItems: "center"
  },
  secondaryButtonText: { color: "#173c2b", fontWeight: "700" },
  error: { color: "#9f1d20" }
});
