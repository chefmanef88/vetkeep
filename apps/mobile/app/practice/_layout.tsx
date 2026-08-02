import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, SafeAreaView, StyleSheet } from "react-native";
import { useSession } from "@/auth/session-provider";

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
        headerTintColor: "#174d35",
        headerStyle: { backgroundColor: "#f7f8f5" }
      }}
    >
      <Stack.Screen name="today" options={{ title: "Today" }} />
      <Stack.Screen name="clients" options={{ title: "Clients" }} />
      <Stack.Screen name="client/[id]" options={{ title: "Client" }} />
      <Stack.Screen name="visit/[id]" options={{ title: "Visit" }} />
      <Stack.Screen name="stock" options={{ title: "Stock" }} />
      <Stack.Screen name="sync" options={{ title: "Sync" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f7f8f5" }
});
