import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { useSession } from "@/auth/session-provider";
import { useSync } from "@/sync/sync-provider";
import { ScrollScreen } from "@/ui/practice-components";
import { Avatar, InfoRow, ListHeader, NavTile } from "@/ui/elements";
import { ScreenTopBar } from "@/ui/screen-top-bar";
import { palette, radius, space, type } from "@/ui/tokens";

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
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: space.lg },
  identityBody: { flex: 1, gap: 2 },
  name: { ...type.display, color: palette.ink },
  business: { ...type.small, color: palette.quiet },
  group: { borderRadius: radius, overflow: "hidden" },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  footnote: { ...type.small, color: palette.quiet, textAlign: "center", marginTop: space.md }
});
