import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/auth/session-provider";
import { LocalUnlockGate } from "@/security/local-unlock-gate";
import { SyncProvider } from "@/sync/sync-provider";

export default function RootLayout() {
  return (
    <SessionProvider>
      <LocalUnlockGate>
        <SyncProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </SyncProvider>
      </LocalUnlockGate>
    </SessionProvider>
  );
}
