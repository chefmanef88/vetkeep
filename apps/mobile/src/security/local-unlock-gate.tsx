import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DEFAULT_INACTIVITY_LOCK_MS } from "@vetkeep/domain";
import { useSession } from "@/auth/session-provider";
import { supabase } from "@/lib/supabase";
import {
  hairline,
  palette,
  radius,
  radiusControl,
  shadowCard,
  space,
  touchTarget,
  type
} from "@/ui/tokens";

export function LocalUnlockGate({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const sessionKey = useMemo(
    () =>
      session ? `${session.user.id}:${session.user.last_sign_in_at ?? session.access_token}` : null,
    [session]
  );
  const [unlockedSessionKey, setUnlockedSessionKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  const promptInProgress = useRef(false);

  const unlock = useCallback(async () => {
    if (!sessionKey || promptInProgress.current) return;
    promptInProgress.current = true;

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !enrolled) {
        setMessage(
          "Biometric or device-passcode unlock is not configured. Configure device security before using real clinical data."
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock VetKeep",
        cancelLabel: "Keep locked",
        disableDeviceFallback: false
      });
      if (result.success) {
        setUnlockedSessionKey(sessionKey);
        setMessage(null);
      }
    } finally {
      promptInProgress.current = false;
    }
  }, [sessionKey]);

  useEffect(() => {
    if (sessionKey && unlockedSessionKey !== sessionKey) {
      queueMicrotask(() => void unlock());
    }
  }, [sessionKey, unlockedSessionKey, unlock]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        backgroundedAt.current = Date.now();
        return;
      }

      if (
        state === "active" &&
        sessionKey &&
        backgroundedAt.current &&
        Date.now() - backgroundedAt.current >= DEFAULT_INACTIVITY_LOCK_MS
      ) {
        setUnlockedSessionKey(null);
      }
      if (state === "active") backgroundedAt.current = null;
    });
    return () => subscription.remove();
  }, [sessionKey]);

  const locked = Boolean(sessionKey && unlockedSessionKey !== sessionKey);
  if (!session || !locked) return children;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <Text style={styles.title}>VetKeep is locked</Text>
        <Text style={styles.text}>{message ?? "Authenticate to continue."}</Text>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => void unlock()}>
          <Text style={styles.buttonText}>Unlock</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void supabase.auth.signOut({ scope: "local" })}
        >
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.ground,
    justifyContent: "center",
    padding: space.xl
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: radius,
    borderWidth: hairline,
    borderColor: palette.line,
    padding: space.xl,
    gap: space.lg,
    ...shadowCard
  },
  title: { ...type.heading, color: palette.ink },
  text: { ...type.body, color: palette.quiet },
  button: {
    backgroundColor: palette.brand,
    borderRadius: radiusControl,
    minHeight: touchTarget,
    alignItems: "center",
    justifyContent: "center"
  },
  buttonText: { ...type.action, color: palette.surface },
  signOut: { ...type.action, textAlign: "center", color: palette.red, paddingVertical: space.sm }
});
