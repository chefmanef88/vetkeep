import { useRouter } from "expo-router";
import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { registerCurrentDevice } from "@/device/device-registry";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import { useSync } from "@/sync/sync-provider";
import { Body, ErrorText, PrimaryButton, SecondaryButton } from "@/ui/components";
import { Card, ScrollScreen, SectionTitle } from "@/ui/practice-components";
import { InfoRow, NavTile, PageHeader, StatTile } from "@/ui/elements";
import { useSession } from "@/auth/session-provider";
import { space } from "@/ui/tokens";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** First name only. "Good morning, Kwame" reads like a person, not a record. */
function firstName(full: string | null | undefined): string {
  if (!full) return "there";
  return full.trim().split(/\s+/)[0] ?? "there";
}

export function HomeScreen() {
  const { profile } = useSession();
  const { pendingCount, conflicts, deadLetters } = useSync();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // The count behind "Start work", so the day has a size before it is opened.
  const { data: dueToday } = useQuery<number>(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const { count, error: queryError } = await supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .in("status", ["confirmed", "rescheduled"])
      .gte("scheduled_start", start.toISOString())
      .lt("scheduled_start", end.toISOString());

    if (queryError) throw new Error("Could not count today's visits.");
    return count ?? 0;
  }, []);

  const needsAttention = conflicts.length + deadLetters.length;
  const licenceVerified = profile?.license_verified === true;

  return (
    <ScrollScreen topInset>
      <PageHeader
        title={`${greeting()}, ${firstName(profile?.full_name)}`}
        subtitle={new Date().toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long"
        })}
      />

      <View style={styles.statRow}>
        <StatTile
          icon="calendar"
          label="Visits today"
          value={dueToday ?? "—"}
          tone="brand"
          onPress={() => router.push("/practice/today")}
        />
        <StatTile
          icon={needsAttention > 0 ? "alert-circle" : "cloud-done"}
          label={needsAttention > 0 ? "Need you" : "Waiting to send"}
          value={needsAttention > 0 ? needsAttention : pendingCount}
          tone={needsAttention > 0 ? "warn" : pendingCount > 0 ? "neutral" : "good"}
          onPress={() => router.push("/practice/sync")}
        />
      </View>

      <PrimaryButton label="Start work" onPress={() => router.push("/practice/today")} />

      <View style={styles.grid}>
        <NavTile icon="people" label="Clients" onPress={() => router.push("/practice/clients")} />
        <NavTile icon="cube" label="Stock" onPress={() => router.push("/practice/stock")} />
        <NavTile
          icon="sync"
          label="Sync"
          badge={needsAttention}
          onPress={() => router.push("/practice/sync")}
        />
      </View>

      <Card>
        <SectionTitle>This account</SectionTitle>
        <InfoRow
          icon="person-circle-outline"
          label="Status"
          value={profile?.account_status ?? "unknown"}
          tone={profile?.account_status === "active" ? "good" : "warn"}
        />
        <InfoRow
          icon={licenceVerified ? "shield-checkmark-outline" : "shield-outline"}
          label="Licence"
          value={licenceVerified ? "Verified" : "Pending"}
          tone={licenceVerified ? "good" : "warn"}
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
        {message ? <Body>{message}</Body> : null}
        <SecondaryButton
          label="Register or refresh this device"
          onPress={() => {
            setError(null);
            setMessage(null);
            void registerCurrentDevice()
              .then(() => setMessage("Device registration refreshed."))
              .catch((reason: unknown) =>
                setError(reason instanceof Error ? reason.message : "Registration failed")
              );
          }}
        />
        <SecondaryButton
          label="Sign out"
          onPress={() => void supabase.auth.signOut({ scope: "local" })}
        />
      </Card>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  statRow: { flexDirection: "row", gap: space.md },
  grid: { flexDirection: "row", gap: space.md }
});
