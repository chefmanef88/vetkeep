import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import { Card, Muted, ScrollScreen } from "@/ui/practice-components";
import { EmptyState, ListHeader, PageHeader } from "@/ui/elements";
import { ErrorText } from "@/ui/components";
import { fonts, hairline, palette, radiusControl, space, type } from "@/ui/tokens";

/**
 * What is due, and who to ring (brief §12).
 *
 * Nothing sends. Delivery needs a WhatsApp Business account that does not
 * exist, so every reminder sits at "queued" — the honest state rather than a
 * defect. Until there is a provider this screen is the product: the vet sees
 * what is due, taps to call, and marks it done.
 *
 * The queue is real and fills itself: signing a record with a review date,
 * recording preventive care with a next due date, or giving a treatment that
 * creates a withholding period. It empties when the reason goes — a voided
 * record, a client who withdraws consent.
 */

type Reminder = {
  id: string;
  reminder_type: string;
  template_key: string;
  send_at: string;
  recipient_e164: string;
  patient_name: string;
  client_name: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  follow_up: "Follow-up",
  vaccination_due: "Vaccination due",
  withdrawal_ends: "Withholding ends"
};

const WHAT: Record<string, string> = {
  follow_up_due: "review this animal",
  vaccination_due: "vaccination coming due",
  deworming_due: "worming coming due",
  parasite_control_due: "tick and flea treatment coming due",
  withdrawal_ends: "milk or meat safe again"
};

function formatDay(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export default function RemindersScreen() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data, loading, reload } = useQuery<{ reminders: Reminder[]; now: number }>(async () => {
    // Ninety days: a vet planning a farm round wants what is coming, not only
    // what has landed.
    const { data: rows, error: rpcError } = await supabase.rpc("due_reminders", {
      p_within_days: 90
    });
    if (rpcError) throw new Error(rpcError.message);
    // Captured with the data rather than read during render: the clock is not a
    // pure input, and a render that reads it gives a different answer each time.
    return { reminders: (rows ?? []) as Reminder[], now: Date.now() };
  }, []);

  const reminders = data?.reminders ?? [];
  const now = data?.now ?? 0;
  const due = reminders.filter((r) => new Date(r.send_at).getTime() <= now);
  const soon = reminders.filter((r) => new Date(r.send_at).getTime() > now);

  async function handled(id: string) {
    setError(null);
    setBusy(id);
    const { error: rpcError } = await supabase.rpc("mark_reminder_handled", { p_id: id });
    setBusy(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    reload();
  }

  function row(reminder: Reminder, isDue: boolean) {
    return (
      <View key={reminder.id} style={styles.entry}>
        <View style={styles.entryHead}>
          <Text style={styles.animal}>{reminder.patient_name}</Text>
          <Text style={[styles.when, isDue && styles.whenDue]}>{formatDay(reminder.send_at)}</Text>
        </View>
        <Text style={styles.what}>
          {TYPE_LABEL[reminder.reminder_type] ?? reminder.reminder_type} —{" "}
          {WHAT[reminder.template_key] ?? reminder.template_key}
        </Text>
        <Text style={styles.who}>{reminder.client_name ?? "Owner"}</Text>

        <View style={styles.actions}>
          {/* One tap to the thing the vet is going to do anyway. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Call ${reminder.client_name ?? "the owner"}`}
            style={styles.action}
            onPress={() => void Linking.openURL(`tel:${reminder.recipient_e164}`)}
          >
            <Ionicons name="call-outline" size={15} color={palette.brandInk} />
            <Text style={styles.actionText}>{reminder.recipient_e164}</Text>
          </Pressable>

          {isDue ? (
            <Pressable
              accessibilityRole="button"
              style={styles.action}
              disabled={busy === reminder.id}
              onPress={() => void handled(reminder.id)}
            >
              <Ionicons name="checkmark-circle-outline" size={15} color={palette.green} />
              <Text style={styles.doneText}>{busy === reminder.id ? "Marking…" : "Contacted"}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <ScrollScreen>
      <PageHeader title="Reminders" subtitle="What is due, and who to tell" />

      {/* Said plainly rather than left to be inferred from an empty inbox. A vet
          who assumes these went out will not make the call. */}
      <Card>
        <View style={styles.noticeHead}>
          <Ionicons name="information-circle-outline" size={18} color={palette.amber} />
          <Text style={styles.noticeTitle}>Nothing sends automatically yet</Text>
        </View>
        <Muted>
          Messaging needs a WhatsApp Business account, which is not connected. These are yours to
          act on: call the client, then mark it contacted.
        </Muted>
      </Card>

      {error ? <ErrorText>{error}</ErrorText> : null}
      {loading && reminders.length === 0 ? <ActivityIndicator /> : null}

      {due.length > 0 ? <ListHeader title="Due now" count={due.length} /> : null}
      {due.map((reminder) => row(reminder, true))}

      {soon.length > 0 ? <ListHeader title="Coming up" count={soon.length} /> : null}
      {soon.map((reminder) => row(reminder, false))}

      {!loading && reminders.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="Nothing due"
          hint="Reminders appear when you sign a record with a review date, record a vaccination with a next due date, or give a treatment that creates a withholding period."
        />
      ) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  entry: {
    gap: 3,
    paddingVertical: space.md,
    borderBottomWidth: hairline,
    borderBottomColor: palette.line
  },
  entryHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  animal: { ...type.strong, fontSize: 15, color: palette.ink },
  when: { ...type.small, fontSize: 12, color: palette.quiet },
  whenDue: { color: palette.amber, fontFamily: fonts.semibold },
  what: { ...type.small, fontSize: 13, color: palette.ink },
  who: { ...type.small, fontSize: 12, color: palette.quiet },
  actions: { flexDirection: "row", gap: space.sm, paddingTop: space.sm, flexWrap: "wrap" },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radiusControl,
    backgroundColor: palette.ground
  },
  actionText: { ...type.small, fontSize: 12, color: palette.brandInk, fontFamily: fonts.mono },
  doneText: { ...type.small, fontSize: 12, color: palette.green, fontFamily: fonts.semibold },
  noticeHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  noticeTitle: { ...type.strong, fontSize: 15, color: palette.ink }
});
