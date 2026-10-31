import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Platform, StyleSheet, type ColorValue } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useSession } from "@/auth/session-provider";
import { TabBarBackground } from "@/ui/tab-bar-background";
import { fonts, palette, radiusPill, space, tabBarHeight } from "@/ui/tokens";

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
          // Flush to the bottom and the full width, covering the home-indicator
          // area too. Floating it left a strip of live page visible underneath,
          // which read as two surfaces arguing rather than one — and scrolling
          // content through that gap was the confusing part. Now everything
          // passing beneath goes under the material.
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: tabBarHeight + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: "transparent",
          // The bright top edge belongs to the material; a second border here
          // would draw a line across the glass.
          borderTopWidth: 0,
          paddingHorizontal: space.xs,
          paddingTop: 6,
          // Android draws depth with elevation and ignores the shadow
          // properties entirely; iOS is the other way round. Giving both the
          // same values would have meant no shadow at all on Android.
          ...Platform.select({
            ios: {
              shadowColor: "#0B1A10",
              shadowOpacity: 0.1,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: -2 }
            },
            android: { elevation: 12 },
            default: {}
          })
        },
        // Heavier than it would be on a solid bar. Over a translucent surface
        // the background is always moving, and flat light-weight text stops
        // holding against it — weight is what keeps a label legible there.
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 0.1 },
        // The selected tab's capsule. Tinted rather than white-on-white: a pale
        // white pill on pale glass is the thing that disappeared, and brand
        // green is both visible and says which application you are in.
        tabBarActiveBackgroundColor: palette.greenSoft,
        tabBarItemStyle: {
          borderRadius: radiusPill,
          marginTop: 4,
          marginBottom: 4,
          marginHorizontal: 6,
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
