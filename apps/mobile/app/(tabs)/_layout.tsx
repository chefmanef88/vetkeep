import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useSession } from "@/auth/session-provider";
import { fonts, hairline, palette, tabBarHeight } from "@/ui/tokens";

/**
 * The four places a veterinarian moves between, and the gate in front of them.
 *
 * The gate is the same one the practice stack uses, and it is here rather than
 * on any single screen so that routing straight to a tab cannot step around it.
 *
 * Which four took some deciding. The work is: find the animal, open its folder,
 * write in it. Clients and Animals are two ways into the same folders — by the
 * person who telephoned, or by the animal itself — and both are needed, because
 * a vet rung about "Kofi's goat" knows the owner, while one looking at an ear
 * tag in a pen knows the animal. Home is where the day starts and where
 * anything needing attention surfaces. Profile is the practice itself.
 *
 * There is no tab for recording a consultation, deliberately. A record belongs
 * to a folder, and a button that started one without a folder would be asking
 * the vet which animal afterwards — which is the wrong order, and how records
 * end up attached to the wrong animal.
 *
 * Headers are off: each screen draws its own top bar, because the menu stays on
 * the left on all of them while the right-hand side belongs to the screen.
 */
export default function TabsLayout() {
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
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.green,
        tabBarInactiveTintColor: palette.quiet,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopWidth: hairline,
          borderTopColor: palette.line,
          height: tabBarHeight,
          paddingTop: 6,
          paddingBottom: 6
        },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        sceneStyle: { backgroundColor: palette.ground }
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: "Clients",
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="animals"
        options={{
          title: "Animals",
          tabBarIcon: ({ color, size }) => <Ionicons name="paw" size={size} color={color} />
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle" size={size} color={color} />
          )
        }}
      />

      {/*
        Reached from the search control on the home screen, not from the bar.
        It lives in this group rather than in the practice stack so the bar stays
        put while searching — a vet who opens search and changes their mind
        should be one tap from where they were, not reliant on a back arrow.
      */}
      <Tabs.Screen name="search" options={{ href: null, title: "Search" }} />
    </Tabs>
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
