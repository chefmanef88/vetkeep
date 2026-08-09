import { useRouter } from "expo-router";
import { ActivityIndicator, Text, View, StyleSheet } from "react-native";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import {
  Card,
  Muted,
  Pill,
  RowButton,
  ScrollScreen,
  SectionTitle,
  palette
} from "@/ui/practice-components";
import { fonts, radiusPill } from "@/ui/tokens";
import { ErrorText, PrimaryButton, SecondaryButton } from "@/ui/components";
import { SyncBanner } from "@/sync/sync-banner";

type Stop = {
  id: string;
  status: string;
  scheduled_start: string | null;
  visit_address: string | null;
  reason_for_visit: string | null;
  visit_id: string | null;
  appointment_type: string;
  patient_id: string | null;
  clients: { name: string; phone_display: string } | null;
  patients: { name: string; species: string } | null;
};

function timeOnly(value: string | null): string {
  if (!value) return "no time set";
  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function TodayScreen() {
  const router = useRouter();

  const { data, error, loading, reload } = useQuery<Stop[]>(async () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const { data: rows, error: queryError } = await supabase
      .from("appointments")
      .select(
        "id, status, scheduled_start, visit_address, reason_for_visit, visit_id, appointment_type, patient_id, clients(name, phone_display), patients(name, species)"
      )
      .is("deleted_at", null)
      .in("status", ["confirmed", "rescheduled"])
      .gte("scheduled_start", start.toISOString())
      .lt("scheduled_start", end.toISOString())
      .order("scheduled_start", { ascending: true });

    if (queryError) throw new Error("Could not load today's visits.");
    return (rows ?? []) as Stop[];
  }, []);

  async function startVisit(stop: Stop) {
    if (!stop.patient_id) return;
    const visitId = globalThis.crypto.randomUUID();
    const { error: rpcError } = await supabase.rpc("create_visit", {
      p_id: visitId,
      p_patient_id: stop.patient_id,
      p_visit_date: new Date().toISOString(),
      p_visit_type: stop.appointment_type,
      p_appointment_id: stop.id
    });
    if (rpcError) throw new Error(rpcError.message);
    router.push(`/practice/visit/${visitId}`);
  }

  return (
    <ScrollScreen>
      <SyncBanner />
      <Card>
        <SectionTitle>
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long"
          })}
        </SectionTitle>

        {loading ? <ActivityIndicator /> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}

        {!loading && data && data.length === 0 ? <Muted>No confirmed visits today.</Muted> : null}

        {(data ?? []).map((stop, index) => (
          <View key={stop.id} style={styles.stop}>
            <View style={styles.stopIndex}>
              <Text style={styles.stopIndexText}>{index + 1}</Text>
            </View>
            <View style={styles.stopBody}>
              <RowButton
                title={stop.patients?.name ?? "Unknown animal"}
                subtitle={`${timeOnly(stop.scheduled_start)} · ${stop.clients?.name ?? "Unknown client"}`}
                meta={
                  <Pill
                    label={stop.visit_id ? "started" : "to do"}
                    tone={stop.visit_id ? "good" : "neutral"}
                  />
                }
                onPress={() => {
                  if (stop.visit_id) router.push(`/practice/visit/${stop.visit_id}`);
                  else void startVisit(stop).catch(() => reload());
                }}
              />
              {stop.visit_address ? <Muted>{stop.visit_address}</Muted> : null}
              {stop.reason_for_visit ? <Muted>{stop.reason_for_visit}</Muted> : null}
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <SectionTitle>Elsewhere</SectionTitle>
        <PrimaryButton label="Clients" onPress={() => router.push("/practice/clients")} />
        <SecondaryButton
          label="What I am carrying"
          onPress={() => router.push("/practice/stock")}
        />
        <SecondaryButton label="Sync" onPress={() => router.push("/practice/sync")} />
        <SecondaryButton label="Back to account" onPress={() => router.replace("/")} />
      </Card>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  stop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  stopIndex: {
    width: 28,
    height: 28,
    borderRadius: radiusPill,
    backgroundColor: palette.green,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16
  },
  stopIndexText: {
    color: palette.surface,
    fontFamily: fonts.semibold,
    fontSize: 13
  },
  stopBody: { flex: 1 }
});
