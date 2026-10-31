import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/auth/session-provider";
import { MenuButton } from "@/ui/app-menu";
import { HeaderBack } from "@/ui/back-button";
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
        // Drawn here rather than left to the navigator. Reaching one of these
        // screens from a tab makes it the first screen of this stack, so
        // React Navigation has nothing to go back to within the stack and
        // draws no arrow — leaving the system gesture as the only way out,
        // which is invisible and which Android does not share.
        headerLeft: () => <HeaderBack />,
        // Reachable from every practice screen, so the things a vet needs
        // occasionally never have to live on the screens they use constantly.
        headerRight: () => <MenuButton />
      }}
    >
      {/* Clients is a tab now, not a screen in this stack. What is left here is
          the detail a tab leads into: one client, one folder, one record. */}
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
