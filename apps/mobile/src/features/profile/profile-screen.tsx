import { useRouter } from "expo-router";
import { useSyncExternalStore } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useSession } from "@/auth/session-provider";
import { useSync } from "@/sync/sync-provider";
import { ScrollScreen } from "@/ui/practice-components";
import { Avatar, InfoRow, ListHeader, NavTile } from "@/ui/elements";
import { ScreenTopBar } from "@/ui/screen-top-bar";
import {
  isSimulatedOffline,
  setSimulatedOffline,
  subscribeToSimulatedOffline
} from "@/dev/offline-switch";
import { hairline, palette, radius, space, type } from "@/ui/tokens";

/**
 * The practice itself: who the records belong to, and the state of the device
 * holding them.
 *
 * It does not replace the menu, which stays reachable from every screen —
 * signing out and closing an account live there because they are rare and
 * deliberate, and a tab a thumb lands on by accident is the wrong home for
 * either. What belongs here is the standing answer to "whose practice is this,
 * and is my work safe", which a vet checks occasionally and should not have to
 * open a menu to see.
 */
export function ProfileScreen() {
  const { profile } = useSession();
  const { pendingCount, conflicts, deadLetters, backing, lastSyncAt } = useSync();
  const router = useRouter();

  const needsAttention = conflicts.length + deadLetters.length;

  return (
    <ScrollScreen topInset tabBarInset>
      <ScreenTopBar title="Profile" />

      <View style={styles.identity}>
        <Avatar name={profile?.full_name ?? "—"} size={64} />
        <View style={styles.identityBody}>
          <Text style={styles.name}>{profile?.full_name ?? "—"}</Text>
          {profile?.business_name ? (
            <Text style={styles.business}>{profile.business_name}</Text>
          ) : null}
        </View>
      </View>

      <ListHeader title="Registration" />
      <View style={styles.group}>
        <InfoRow
          icon="ribbon"
          label="Licence number"
          // Not invented when absent: a blank licence is a fact about the
          // account, and filling it with a dash that looks like a value would
          // be worse than saying it is not recorded.
          value={profile?.license_number ?? "Not recorded"}
          tone={profile?.license_number ? "neutral" : "warn"}
        />
        <InfoRow
          icon={profile?.license_verified ? "checkmark-circle" : "time"}
          label="Licence"
          value={profile?.license_verified ? "Verified" : "Not verified"}
          tone={profile?.license_verified ? "good" : "neutral"}
        />
        {profile?.phone_display ? (
          <InfoRow icon="call" label="Phone" value={profile.phone_display} />
        ) : null}
        {profile?.service_areas && profile.service_areas.length > 0 ? (
          <InfoRow icon="map" label="Service areas" value={profile.service_areas.join(", ")} />
        ) : null}
      </View>

      <ListHeader title="This phone" />
      <View style={styles.group}>
        <InfoRow
          icon={
            needsAttention > 0 ? "alert-circle" : pendingCount > 0 ? "cloud-upload" : "cloud-done"
          }
          label={needsAttention > 0 ? "Needs you" : "Waiting to send"}
          value={
            needsAttention > 0
              ? `${needsAttention} to look at`
              : pendingCount > 0
                ? `${pendingCount} item${pendingCount === 1 ? "" : "s"}`
                : "Everything sent"
          }
          tone={needsAttention > 0 ? "warn" : pendingCount > 0 ? "neutral" : "good"}
          onPress={() => router.push("/practice/sync")}
        />
        <InfoRow
          icon="time"
          label="Last sent"
          value={lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "Nothing sent yet"}
        />
        {/* The same honesty the sync screen carries. A vet deciding whether to
            take this to a real client's animals should be able to see whether
            the records on the phone are encrypted, and brief 5.1 is not met
            under Expo Go. */}
        {backing ? (
          <InfoRow
            icon={
              backing.kind === "keychain"
                ? "alert-circle"
                : backing.encrypted
                  ? "lock-closed"
                  : "lock-open"
            }
            label="Records on this phone"
            value={
              backing.kind === "keychain"
                ? "Secure storage, limited space"
                : backing.encrypted
                  ? "Encrypted database"
                  : "Database, not encrypted"
            }
            tone={backing.kind === "database" && backing.encrypted ? "good" : "warn"}
            onPress={() => router.push("/practice/sync")}
          />
        ) : null}
      </View>

      <ListHeader title="Practice" />
      <View style={styles.tiles}>
        <NavTile icon="cube" label="Products" onPress={() => router.push("/practice/products")} />
        <NavTile
          icon="notifications"
          label="Reminders"
          onPress={() => router.push("/practice/reminders")}
        />
        <NavTile icon="download" label="Export" onPress={() => router.push("/practice/export")} />
        {/* The badge prop is omitted rather than passed as undefined:
            exactOptionalPropertyTypes draws that distinction, and it is the
            right one — there is no such thing as a badge of nothing. */}
        {needsAttention > 0 ? (
          <NavTile
            icon="sync"
            label="Sync"
            badge={needsAttention}
            onPress={() => router.push("/practice/sync")}
          />
        ) : (
          <NavTile icon="sync" label="Sync" onPress={() => router.push("/practice/sync")} />
        )}
      </View>

      <Text style={styles.footnote}>
        Signing out and closing your account are in the menu, top left.
      </Text>

      <OfflineSwitch />
    </ScrollScreen>
  );
}

/**
 * Cuts the app off from the database without touching the network.
 *
 * Here because this is where someone goes looking for the state of the phone,
 * and because it has to be somewhere a person can reach while holding the
 * device — the whole point is to exercise the queue by hand.
 *
 * Renders nothing outside development. The hook runs first because hooks have
 * to run unconditionally, and the check comes after it — which is also why this
 * is a component rather than a condition at the call site.
 */
function OfflineSwitch() {
  const offline = useSyncExternalStore(
    subscribeToSimulatedOffline,
    isSimulatedOffline,
    isSimulatedOffline
  );

  if (!__DEV__) return null;

  return (
    <View style={[styles.devBox, offline && styles.devBoxOn]}>
      <View style={styles.devHead}>
        <Ionicons
          name={offline ? "cloud-offline" : "hammer"}
          size={18}
          color={offline ? palette.red : palette.quiet}
        />
        <Text style={styles.devTitle}>{offline ? "Pretending to be offline" : "Development"}</Text>
        <Switch
          value={offline}
          onValueChange={setSimulatedOffline}
          accessibilityLabel="Pretend this phone has no connection"
        />
      </View>
      <Text style={styles.devHint}>
        {offline
          ? "The database is unreachable. Records save to this phone and wait. Metro and reloading still work."
          : "Turn this on to make the database unreachable without turning off the network, which on a tethered phone would take Metro down too."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: space.lg },
  identityBody: { flex: 1, gap: 2 },
  name: { ...type.display, color: palette.ink },
  business: { ...type.small, color: palette.quiet },
  group: { borderRadius: radius, overflow: "hidden" },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  footnote: { ...type.small, color: palette.quiet, textAlign: "center", marginTop: space.md },
  devBox: {
    marginTop: space.xl,
    padding: space.lg,
    borderRadius: radius,
    borderWidth: hairline,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    gap: space.sm
  },
  devBoxOn: { borderColor: palette.red, backgroundColor: palette.redSoft },
  devHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  devTitle: { ...type.strong, color: palette.ink, flex: 1 },
  devHint: { ...type.small, color: palette.quiet }
});
