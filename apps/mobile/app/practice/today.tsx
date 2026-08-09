import { useRouter } from "expo-router";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import { ScrollScreen } from "@/ui/practice-components";
import { Avatar, EmptyState, ListHeader } from "@/ui/elements";
import { ErrorText } from "@/ui/components";
import { SyncBanner } from "@/sync/sync-banner";
import { fonts, hairline, palette, radius, shadowCard, space, type } from "@/ui/tokens";

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
  if (!value) return "--:--";
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

  const stops = data ?? [];

  return (
    <ScrollScreen>
      <SyncBanner />

      {loading ? <ActivityIndicator /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}

      {stops.length > 0 ? <ListHeader title="Route" count={stops.length} /> : null}

      {stops.map((stop, index) => {
        const started = Boolean(stop.visit_id);
        const phone = stop.clients?.phone_display;
        return (
          <View key={stop.id} style={styles.stop}>
            {/* The rail: time, a node, and a line down to the next stop. It is
                what makes this read as an ordered route rather than a list. */}
            <View style={styles.rail}>
              <Text style={styles.time}>{timeOnly(stop.scheduled_start)}</Text>
              <View style={[styles.node, started && styles.nodeDone]}>
                {started ? <Ionicons name="checkmark" size={12} color={palette.surface} /> : null}
              </View>
              {index < stops.length - 1 ? <View style={styles.line} /> : null}
            </View>

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => {
                if (stop.visit_id) router.push(`/practice/visit/${stop.visit_id}`);
                else void startVisit(stop).catch(() => reload());
              }}
            >
              <View style={styles.cardHead}>
                <Avatar name={stop.patients?.name ?? "?"} tone={started ? "good" : "brand"} />
                <View style={styles.cardTitles}>
                  <Text style={styles.animal} numberOfLines={1}>
                    {stop.patients?.name ?? "Unknown animal"}
                  </Text>
                  <Text style={styles.owner} numberOfLines={1}>
                    {stop.patients?.species ?? "—"} · {stop.clients?.name ?? "Unknown client"}
                  </Text>
                </View>
                <View style={[styles.state, started ? styles.stateDone : styles.stateTodo]}>
                  <Text style={[styles.stateText, started && styles.stateTextDone]}>
                    {started ? "Started" : "To do"}
                  </Text>
                </View>
              </View>

              {stop.reason_for_visit ? (
                <Text style={styles.reason} numberOfLines={2}>
                  {stop.reason_for_visit}
                </Text>
              ) : null}

              {stop.visit_address ? (
                <View style={styles.detail}>
                  <Ionicons name="location-outline" size={15} color={palette.quiet} />
                  <Text style={styles.detailText} numberOfLines={2}>
                    {stop.visit_address}
                  </Text>
                </View>
              ) : null}

              {phone ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${stop.clients?.name ?? "client"}`}
                  style={styles.detail}
                  // Own press target: reaching the owner from the doorstep is a
                  // separate act from opening the consultation.
                  onPress={() => void Linking.openURL(`tel:${phone.replace(/\s/g, "")}`)}
                >
                  <Ionicons name="call-outline" size={15} color={palette.brand} />
                  <Text style={[styles.detailText, styles.callText]}>{phone}</Text>
                </Pressable>
              ) : null}
            </Pressable>
          </View>
        );
      })}

      {!loading && stops.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="Nothing booked today"
          hint="Confirmed visits for today appear here in the order you will drive them."
        />
      ) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  stop: { flexDirection: "row", gap: space.md },
  rail: { alignItems: "center", width: 52 },
  time: { fontFamily: fonts.mono, fontSize: 12, color: palette.quiet, marginBottom: space.xs },
  node: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: palette.brand,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  nodeDone: { backgroundColor: palette.green, borderColor: palette.green },
  line: { flex: 1, width: 2, backgroundColor: palette.line, marginTop: space.xs },
  card: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radius,
    borderWidth: hairline,
    borderColor: palette.line,
    padding: space.lg,
    gap: space.sm,
    marginBottom: space.md,
    ...shadowCard
  },
  cardPressed: { backgroundColor: palette.brandSoft },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  cardTitles: { flex: 1, gap: 1 },
  animal: { ...type.strong, color: palette.ink },
  owner: { ...type.small, color: palette.quiet },
  state: { borderRadius: 999, paddingHorizontal: space.md, paddingVertical: 3 },
  stateTodo: { backgroundColor: palette.brandSoft },
  stateDone: { backgroundColor: palette.greenSoft },
  stateText: { fontFamily: fonts.semibold, fontSize: 11, color: palette.brandInk },
  stateTextDone: { color: palette.green },
  reason: { ...type.small, color: palette.ink },
  detail: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 24 },
  detailText: { ...type.small, color: palette.quiet, flex: 1 },
  callText: { color: palette.brand, fontFamily: fonts.medium }
});
