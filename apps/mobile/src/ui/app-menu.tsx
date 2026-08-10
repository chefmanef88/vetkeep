import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "@/auth/session-provider";
import { useSync } from "@/sync/sync-provider";
import { supabase } from "@/lib/supabase";
import { registerCurrentDevice } from "@/device/device-registry";
import { Avatar, IconChip } from "./elements";
import { fonts, hairline, palette, radius, radiusPill, space, touchTarget, type } from "./tokens";

/**
 * The menu behind the three lines in the header.
 *
 * Built as a modal rather than a navigation drawer deliberately: a real drawer
 * would pull in react-native-gesture-handler and reanimated, which are native
 * and would force another build for what is a list of links. This behaves the
 * same for the one gesture that matters — open it, choose, close.
 *
 * It holds what a vet needs occasionally rather than during a consultation, so
 * the working screens stay about the animal in front of them.
 */

type MenuControls = { open: () => void; close: () => void; isOpen: boolean };

const MenuContext = createContext<MenuControls | null>(null);

export function AppMenuProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const controls = useMemo<MenuControls>(
    () => ({ open: () => setIsOpen(true), close: () => setIsOpen(false), isOpen }),
    [isOpen]
  );

  return (
    <MenuContext.Provider value={controls}>
      {children}
      <AppMenu visible={isOpen} onClose={() => setIsOpen(false)} />
    </MenuContext.Provider>
  );
}

export function useAppMenu(): MenuControls {
  const context = useContext(MenuContext);
  if (!context) throw new Error("useAppMenu must be used inside AppMenuProvider");
  return context;
}

/** The three lines. Placed at the header's leading edge on every screen. */
export function MenuButton() {
  const { open } = useAppMenu();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open menu"
      hitSlop={12}
      style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
      onPress={open}
    >
      <Ionicons name="menu" size={24} color={palette.ink} />
    </Pressable>
  );
}

function MenuRow({
  icon,
  label,
  detail,
  badge,
  tone = "ink",
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  badge?: number;
  tone?: "ink" | "danger";
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={20}
        color={tone === "danger" ? palette.red : palette.quiet}
        style={styles.rowIcon}
      />
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, tone === "danger" && styles.rowLabelDanger]}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {badge !== undefined && badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={palette.line} />
    </Pressable>
  );
}

function AppMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useSession();
  const { pendingCount, conflicts, deadLetters } = useSync();
  const [deviceMessage, setDeviceMessage] = useState<string | null>(null);

  const needsAttention = conflicts.length + deadLetters.length;
  const licenceVerified = profile?.license_verified === true;

  function go(path: "/practice/clients" | "/practice/products" | "/practice/sync") {
    onClose();
    router.push(path);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      // Android's back button closes the menu rather than leaving the screen
      // behind it, which onRequestClose gives for free.
      statusBarTranslucent
    >
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={[styles.sheet, { paddingTop: insets.top + space.lg }]}>
        <View style={styles.grabber} />

        <View style={styles.identity}>
          <Avatar name={profile?.full_name ?? "Vet"} />
          <View style={styles.identityBody}>
            <Text style={styles.identityName} numberOfLines={1}>
              {profile?.full_name ?? "VetKeep"}
            </Text>
            <Text style={styles.identityMeta} numberOfLines={1}>
              {profile?.business_name ?? "Independent practice"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            hitSlop={12}
            onPress={onClose}
          >
            <Ionicons name="close" size={22} color={palette.quiet} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}>
          <View style={styles.licence}>
            <IconChip
              name={licenceVerified ? "shield-checkmark" : "shield-outline"}
              tone={licenceVerified ? "good" : "warn"}
              size={38}
            />
            <View style={styles.rowBody}>
              <Text style={styles.rowLabel}>
                Licence {licenceVerified ? "verified" : "pending"}
              </Text>
              <Text style={styles.rowDetail}>
                {profile?.license_number ?? "No licence number recorded"} · account{" "}
                {profile?.account_status ?? "unknown"}
              </Text>
            </View>
          </View>

          <Text style={styles.groupLabel}>Practice</Text>
          <MenuRow
            icon="people-outline"
            label="Clients and folders"
            detail="Everyone you keep records for"
            onPress={() => go("/practice/clients")}
          />
          <MenuRow
            icon="medkit-outline"
            label="Products"
            detail="What you use, and what it obliges"
            onPress={() => go("/practice/products")}
          />
          <MenuRow
            icon="sync-outline"
            label="Sync"
            detail={
              needsAttention > 0
                ? "Items need your decision"
                : pendingCount > 0
                  ? `${pendingCount} waiting to send`
                  : "Everything is sent"
            }
            badge={needsAttention}
            onPress={() => go("/practice/sync")}
          />

          <Text style={styles.groupLabel}>This device</Text>
          <MenuRow
            icon="phone-portrait-outline"
            label="Register or refresh this device"
            detail={deviceMessage ?? "Keeps offline access working"}
            onPress={() => {
              setDeviceMessage("Refreshing…");
              void registerCurrentDevice()
                .then(() => setDeviceMessage("Registration refreshed."))
                .catch((reason: unknown) =>
                  setDeviceMessage(reason instanceof Error ? reason.message : "Registration failed")
                );
            }}
          />

          <Text style={styles.groupLabel}>Account</Text>
          <MenuRow
            icon="log-out-outline"
            label="Sign out"
            detail="Records stay on this device until it is revoked"
            tone="danger"
            onPress={() => {
              onClose();
              void supabase.auth.signOut({ scope: "local" });
            }}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(23, 33, 27, 0.45)" },
  sheet: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "86%",
    maxWidth: 380,
    backgroundColor: palette.surface,
    borderTopRightRadius: radius,
    borderBottomRightRadius: radius,
    paddingHorizontal: space.lg
  },
  grabber: {
    position: "absolute",
    right: space.sm,
    top: "50%",
    width: 3,
    height: 48,
    borderRadius: radiusPill,
    backgroundColor: palette.line
  },
  menuButton: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  pressed: { opacity: 0.6 },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingBottom: space.lg,
    borderBottomWidth: hairline,
    borderBottomColor: palette.line
  },
  identityBody: { flex: 1, gap: 1 },
  identityName: { ...type.heading, fontSize: 18, color: palette.ink },
  identityMeta: { ...type.small, fontSize: 12, color: palette.quiet },
  licence: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md
  },
  groupLabel: {
    ...type.label,
    color: palette.quiet,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: space.lg,
    marginBottom: space.xs
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: touchTarget,
    paddingVertical: space.sm
  },
  rowPressed: { backgroundColor: palette.brandSoft },
  rowIcon: { width: 22, textAlign: "center" },
  rowBody: { flex: 1, gap: 1 },
  rowLabel: { ...type.strong, fontSize: 15, color: palette.ink },
  rowLabelDanger: { color: palette.red },
  rowDetail: { ...type.small, fontSize: 12, color: palette.quiet },
  badge: {
    backgroundColor: palette.red,
    borderRadius: radiusPill,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignItems: "center"
  },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11, color: palette.surface }
});
