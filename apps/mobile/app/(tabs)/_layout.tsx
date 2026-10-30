import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, StyleSheet, type ColorValue } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useSession } from "@/auth/session-provider";
import { TabBarBackground } from "@/ui/tab-bar-background";
import { fonts, palette, space, tabBarHeight, tabBarMargin, tabBarRadius } from "@/ui/tokens";

/**
 * React Native 0.88 widened ColorValue to include null and a processed colour
 * integer; the icon set takes neither. The navigator passes a string in
 * practice, so this narrows rather than asserts: anything the icons cannot
 * render becomes undefined and they fall back to their own default, which is
 * what a tab with no colour should look like.
 */
function iconColor(color: ColorValue): Exclude<ColorValue, null | number> | undefined {
  return color === null || typeof color === "number" ? undefined : color;
}

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
  const insets = useSafeAreaInsets();

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
        tabBarActiveTintColor: palette.brandInk,
        tabBarInactiveTintColor: palette.quiet,
        // The material, drawn behind the bar. See tab-bar-background for why it
        // is a layer rather than a colour, and what it does when someone has
        // asked for reduced transparency.
        tabBarBackground: () => <TabBarBackground />,
        tabBarStyle: {
          // A floating object, not a band across the bottom of the screen.
          // Inset from all three edges so the page is visible around it and it
          // reads as resting above the content rather than bounding it.
          position: "absolute",
          left: tabBarMargin,
          right: tabBarMargin,
          bottom: Math.max(insets.bottom, tabBarMargin),
          height: tabBarHeight,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          // Matches the material's clip so the shadow follows the pill. The
          // rounding itself is on the background, because a view cannot both
          // clip its children and cast a shadow.
          borderRadius: tabBarRadius,
          paddingHorizontal: space.xs,
          paddingTop: 0,
          paddingBottom: 0,
          // A bigger surface reads as further off the page, so this is deeper
          // than a card's shadow rather than the same one reused.
          shadowColor: "#0B1A10",
          shadowOpacity: 0.14,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 }
        },
        // Heavier than it would be on a solid bar. Over a translucent surface
        // the background is always moving, and flat light-weight text stops
        // holding against it — weight is what keeps a label legible there.
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 0.1 },
        // The selected tab gets its own capsule inside the bar: a raised pill
        // catching the light, which says where you are without relying on
        // colour alone. Inset vertically so it floats within the glass rather
        // than filling it edge to edge.
        tabBarActiveBackgroundColor: "rgba(255,255,255,0.92)",
        tabBarItemStyle: {
          borderRadius: tabBarRadius - 8,
          marginVertical: 8,
          marginHorizontal: 4,
          paddingTop: 6,
          paddingBottom: 4
        },
        sceneStyle: { backgroundColor: palette.ground }
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={focused ? size + 1 : size}
              color={iconColor(color)}
            />
          )
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: "Clients",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              size={focused ? size + 1 : size}
              color={iconColor(color)}
            />
          )
        }}
      />
      <Tabs.Screen
        name="animals"
        options={{
          title: "Animals",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "paw" : "paw-outline"}
              size={focused ? size + 1 : size}
              color={iconColor(color)}
            />
          )
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person-circle" : "person-circle-outline"}
              size={focused ? size + 1 : size}
              color={iconColor(color)}
            />
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
