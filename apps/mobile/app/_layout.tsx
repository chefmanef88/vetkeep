// First, before any screen or provider can reach for globalThis.crypto.
import "@/polyfills/crypto";
import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  useFonts
} from "@expo-google-fonts/geist";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "@/auth/session-provider";
import { LocalUnlockGate } from "@/security/local-unlock-gate";
import { SyncProvider } from "@/sync/sync-provider";
import { palette } from "@/ui/tokens";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_400Regular
  });

  useEffect(() => {
    // Hidden on error as well as on success: a missing font is a reason to fall
    // back to the system face, not to leave the vet staring at a splash screen.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <SessionProvider>
        <LocalUnlockGate>
          <SyncProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: palette.ground }
              }}
            />
          </SyncProvider>
        </LocalUnlockGate>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
