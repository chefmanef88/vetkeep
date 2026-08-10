import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/auth/session-provider";
import { MenuButton } from "@/ui/app-menu";
import { palette, type } from "@/ui/tokens";

/**
 * Every practice screen sits behind the same gate as the rest of the app: a live
 * session, MFA satisfied, and an onboarded profile. Routing here directly cannot
 * bypass it, because the check runs in the layout rather than on one screen.
 */
export default function PracticeLayout() {
  const { loading, session, mfaState, profile } = useSession();

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  if (!session || mfaState !== "ready" || !profile) {
    return <Redirect href="/" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: "Back",
        headerTintColor: palette.green,
        headerStyle: { backgroundColor: palette.ground },
        // Flat against the page. The hairline under the header does the
        // separating that a shadow would otherwise do.
        headerShadowVisible: false,
        headerTitleStyle: { ...type.heading, color: palette.ink },
        contentStyle: { backgroundColor: palette.ground },
        // Reachable from every practice screen, so the things a vet needs
        // occasionally never have to live on the screens they use constantly.
        headerRight: () => <MenuButton />
      }}
    >
      <Stack.Screen name="clients" options={{ title: "Clients" }} />
      <Stack.Screen name="client/[id]" options={{ title: "Client" }} />
      <Stack.Screen name="patient/[id]" options={{ title: "Folder" }} />
      <Stack.Screen name="visit/[id]" options={{ title: "Record" }} />
      <Stack.Screen name="products" options={{ title: "Products" }} />
      <Stack.Screen name="sync" options={{ title: "Sync" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.ground
  }
});
