import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import { Card, Muted, ScrollScreen } from "@/ui/practice-components";
import { PageHeader } from "@/ui/elements";
import { ErrorText, Field, PrimaryButton, SecondaryButton } from "@/ui/components";
import { fonts, hairline, palette, radiusControl, space, type } from "@/ui/tokens";

/**
 * Closing the account (brief §17.2).
 *
 * The most consequential screen in the application, and the one most likely to
 * be reached by accident from a menu. It is written to slow the reader down: it
 * says what survives before it says what stops, because the thing people get
 * wrong about closing a clinical account is assuming the records go with it.
 *
 * They do not, and they cannot. A withholding date a farmer is relying on does
 * not stop mattering because the veterinarian left the profession, and §8.2
 * already forbids erasing a signed record. So this screen makes the retention
 * plain rather than burying it, and the server refuses anything that arrives
 * without a recently authenticated session and the phrase typed out in full.
 */

const CONFIRMATION = "CLOSE MY ACCOUNT";

export default function CloseAccountScreen() {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  // What closing would actually affect, counted rather than described, so the
  // decision is made against this practice's real numbers.
  const { data } = useQuery<{ folders: number; records: number; devices: number }>(async () => {
    const [folders, records, devices] = await Promise.all([
      supabase.from("patients").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase.from("visits").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase
        .from("vet_devices")
        .select("id", { count: "exact", head: true })
        .is("revoked_at", null)
    ]);
    return {
      folders: folders.count ?? 0,
      records: records.count ?? 0,
      devices: devices.count ?? 0
    };
  }, []);

  const ready = confirmation.trim().toUpperCase() === CONFIRMATION;

  async function close() {
    setError(null);
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("close_vet_account", {
      p_confirmation: confirmation,
      ...(reason.trim() === "" ? {} : { p_reason: reason.trim() })
    });
    setBusy(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setClosed(true);
    // The session is no longer good for anything but reading, and leaving it
    // alive on the device would only invite confusion.
    await supabase.auth.signOut({ scope: "local" });
  }

  if (closed) {
    return (
      <ScrollScreen>
        <PageHeader title="Account closed" subtitle="Nothing new can be recorded" />
        <Card>
          <View style={styles.doneHead}>
            <Ionicons name="checkmark-circle" size={22} color={palette.green} />
            <Text style={styles.doneTitle}>Your account is closed</Text>
          </View>
          <Muted>
            Every device has been signed out and nothing new can be recorded. Your clinical records
            are retained under the practice&rsquo;s stated retention policy, as the law requires.
          </Muted>
          <Muted>
            If you closed this by mistake, contact support. It cannot be reopened from the app.
          </Muted>
        </Card>
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <PageHeader title="Close your account" subtitle="Permanent, and it cannot be undone" />

      {/* What survives comes first. It is the part people assume wrongly. */}
      <Card>
        <View style={styles.head}>
          <Ionicons name="archive-outline" size={20} color={palette.brandInk} />
          <Text style={styles.headTitle}>What is kept</Text>
        </View>
        <Muted>
          Signed consultation records cannot be deleted, by you or by us. A withholding date a
          farmer is relying on does not stop applying because you have left, and a clinical record
          may be needed long after the animal has changed hands.
        </Muted>
        <Muted>
          Records are retained for the period set out in the privacy notice, then handled according
          to it.
        </Muted>
        {/* Said here because it is the reassuring half of the same fact: what
            is kept is what the records need, not everything we hold. */}
        <Muted>
          Your name and licence number are kept too, because the records you signed have to remain
          attributable to you. Your phone number, WhatsApp number, business name and service areas
          are removed.
        </Muted>
      </Card>

      <Card>
        <View style={styles.head}>
          <Ionicons name="close-circle-outline" size={20} color={palette.amber} />
          <Text style={styles.headTitle}>What stops</Text>
        </View>
        <View style={styles.counts}>
          <Count value={data?.devices ?? 0} label="devices signed out" />
          <Count value={data?.folders ?? 0} label="folders become read-only" />
          <Count value={data?.records ?? 0} label="records kept, none new" />
        </View>
        <Muted>
          You will not be able to add a client, open a folder, or write a consultation again. You
          can still read what is already there.
        </Muted>
      </Card>

      <Card>
        <View style={styles.head}>
          <Ionicons name="download-outline" size={20} color={palette.quiet} />
          <Text style={styles.headTitle}>Take a copy first</Text>
        </View>
        <Muted>
          Export everything first — clients, folders, every consultation, treatments and their
          withholding dates. You keep the file; closing does not take it away.
        </Muted>
        <SecondaryButton
          label="Export your practice"
          onPress={() => router.push("/practice/export")}
        />
      </Card>

      <Card>
        <View style={styles.head}>
          <Ionicons name="warning-outline" size={20} color={palette.red} />
          <Text style={styles.headTitleDanger}>This cannot be undone</Text>
        </View>

        <Text style={styles.label}>Why are you closing? (optional)</Text>
        <Field
          value={reason}
          onChangeText={setReason}
          placeholder="Leaving practice"
          multiline
          numberOfLines={2}
        />

        <Text style={styles.label}>Type {CONFIRMATION} to confirm</Text>
        <Field
          value={confirmation}
          onChangeText={setConfirmation}
          placeholder={CONFIRMATION}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Confirmation phrase"
        />

        <Muted>
          You may be asked to sign in again. Closing an account needs a recent sign-in, not just an
          open session.
        </Muted>

        {error ? <ErrorText>{error}</ErrorText> : null}

        <PrimaryButton
          label={busy ? "Closing…" : "Close my account"}
          disabled={!ready || busy}
          tone="danger"
          onPress={() => void close()}
        />
      </Card>
    </ScrollScreen>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.count}>
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  headTitle: { ...type.strong, fontSize: 16, color: palette.ink },
  headTitleDanger: { ...type.strong, fontSize: 16, color: palette.red },
  label: { ...type.label, color: palette.quiet, marginTop: space.sm },
  counts: {
    flexDirection: "row",
    gap: space.sm,
    borderTopWidth: hairline,
    borderTopColor: palette.line,
    paddingTop: space.md,
    marginTop: space.xs
  },
  count: {
    flex: 1,
    backgroundColor: palette.ground,
    borderRadius: radiusControl,
    padding: space.md,
    gap: 2
  },
  countValue: { fontFamily: fonts.semibold, fontSize: 20, color: palette.ink },
  countLabel: { ...type.small, fontSize: 11, color: palette.quiet, lineHeight: 15 },
  doneHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  doneTitle: { ...type.strong, fontSize: 17, color: palette.ink }
});
