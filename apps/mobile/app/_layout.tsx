import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/auth/session-provider";
import { LocalUnlockGate } from "@/security/local-unlock-gate";

export default function RootLayout() {
  return (
    <SessionProvider>
      <LocalUnlockGate>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </LocalUnlockGate>
    </SessionProvider>
  );
}
