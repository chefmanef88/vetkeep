import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { DEFAULT_INACTIVITY_LOCK_MS } from "@vetkeep/domain";
import { useSession } from "@/auth/session-provider";
import { supabase } from "@/lib/supabase";

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
        <Pressable style={styles.button} onPress={() => void unlock()}>
          <Text style={styles.buttonText}>Unlock</Text>
        </Pressable>
        <Pressable onPress={() => void supabase.auth.signOut({ scope: "local" })}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f8f5", justifyContent: "center", padding: 24 },
  card: { backgroundColor: "white", borderRadius: 18, padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: "700", color: "#17211b" },
  text: { fontSize: 16, color: "#536159" },
  button: { backgroundColor: "#174d35", borderRadius: 12, padding: 14, alignItems: "center" },
  buttonText: { color: "white", fontWeight: "700" },
  signOut: { textAlign: "center", color: "#9f1d20", fontWeight: "700" }
});
