import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CODE_TAKEN_MESSAGE } from "@vetkeep/domain";
import {
  buildResolvedPayload,
  isFullyResolved,
  type OutboundMutation,
  type Resolution
} from "@vetkeep/sync";
import { supabase } from "@/lib/supabase";
import { useSync } from "@/sync/sync-provider";
import { isCodeTakenReason } from "@/sync/code-remedy";
import { describeEntity, loadConflict, type LoadedConflict } from "@/sync/conflict-loader";
import { Body, ErrorText, PrimaryButton, SecondaryButton } from "@/ui/components";
import { Card, FieldLabel, Muted, ScrollScreen, SectionTitle } from "@/ui/practice-components";
import { EmptyState, IconChip, ListHeader, ProgressBar } from "@/ui/elements";
import { fonts, hairline, palette, radius, radiusControl, space, type } from "@/ui/tokens";

/**
 * The conflict screen required by brief 15.6.
 *
 * Two devices disagreed about an animal. Software cannot decide which
 * observation is right, so this screen puts both in front of the vet with what
 * it knows about where each came from, and makes them choose. There is no
 * "resolve all" button on purpose: the whole point is that each disagreement
 * gets looked at.
 */
export default function SyncScreen() {
  const {
    pendingCount,
    conflicts,
    deadLetters,
    lastSyncAt,
    flush,
    dismissDeadLetter,
    resendWithNewCode
  } = useSync();
  const [open, setOpen] = useState<LoadedConflict | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const openConflict = useCallback(async (mutation: OutboundMutation) => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadConflict(mutation);
      if (!loaded) {
        setError("Could not load the other version. Try again when you have signal.");
        return;
      }
      setOpen(loaded);
    } finally {
      setLoading(false);
    }
  }, []);

  if (open) {
    return (
      <ConflictDetail
        loaded={open}
        onClose={() => setOpen(null)}
        onResolved={() => {
          setOpen(null);
          void flush();
        }}
      />
    );
  }

  const settled = pendingCount === 0 && conflicts.length === 0 && deadLetters.length === 0;

  return (
    <ScrollScreen>
      {/* One state, said plainly, before any list. Everything held on the phone
          is unsent clinical work, so this is the first thing to answer. */}
      <View style={[styles.state, settled ? styles.stateGood : styles.stateBusy]}>
        <IconChip
          name={
            settled ? "checkmark-circle" : conflicts.length > 0 ? "alert-circle" : "cloud-upload"
          }
          tone={settled ? "good" : conflicts.length > 0 ? "warn" : "brand"}
          size={48}
        />
        <View style={styles.stateBody}>
          <Text style={styles.stateTitle}>
            {settled
              ? "Everything is sent"
              : `${pendingCount} item${pendingCount === 1 ? "" : "s"} waiting to send`}
          </Text>
          <Text style={styles.stateDetail}>
            {lastSyncAt
              ? `Last sent ${new Date(lastSyncAt).toLocaleString()}`
              : "Nothing has been sent from this phone yet."}
          </Text>
        </View>
      </View>

      {error ? <ErrorText>{error}</ErrorText> : null}
      {loading ? <ActivityIndicator /> : null}
      <PrimaryButton label="Send now" onPress={() => void flush()} />

      {conflicts.length > 0 ? (
        <>
          <ListHeader title="Needs your decision" count={conflicts.length} />
          <Muted>
            Another device changed these while this phone was offline. Nothing is applied until you
            choose.
          </Muted>
          {conflicts.map((mutation) => (
            <Pressable
              key={mutation.mutationId}
              accessibilityRole="button"
              style={({ pressed }) => [styles.conflictRow, pressed && styles.pressed]}
              onPress={() => void openConflict(mutation)}
            >
              <IconChip name="git-compare" tone="warn" size={40} />
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{describeEntity(mutation)}</Text>
                <Text style={styles.rowMeta}>Changed on another device</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.amber} />
            </Pressable>
          ))}
        </>
      ) : null}

      {deadLetters.length > 0 ? (
        <>
          <ListHeader title="Could not be sent" count={deadLetters.length} />
          <Muted>
            The server refused these. They are kept here rather than discarded, so nothing is lost
            without you seeing it.
          </Muted>
          {deadLetters.map((entry) => {
            // A repeated reference is the one refusal with a way forward. It is
            // offered rather than done automatically: the vet may already have
            // written the old reference on the client's copy, and they are the
            // only one who knows that.
            const codeTaken = isCodeTakenReason(entry.reason);

            return (
              <View key={entry.mutation.mutationId} style={styles.deadRow}>
                <View style={styles.deadHead}>
                  <IconChip
                    name={codeTaken ? "pricetag-outline" : "close-circle"}
                    tone={codeTaken ? "warn" : "bad"}
                    size={36}
                  />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{describeEntity(entry.mutation)}</Text>
                    <Text style={styles.rowMeta}>{new Date(entry.failedAt).toLocaleString()}</Text>
                  </View>
                </View>

                <Text style={styles.reason}>{codeTaken ? CODE_TAKEN_MESSAGE : entry.reason}</Text>

                {codeTaken ? (
                  <>
                    <Text style={styles.reasonHint}>
                      Sending this again under a new reference will save it. If you have already
                      given the old reference to the client, tell them it has changed.
                    </Text>
                    <SecondaryButton
                      label={
                        busyId === entry.mutation.mutationId
                          ? "Sending…"
                          : "Give it a new reference and send"
                      }
                      onPress={() => {
                        setBusyId(entry.mutation.mutationId);
                        void resendWithNewCode(entry.mutation.mutationId).finally(() =>
                          setBusyId(null)
                        );
                      }}
                    />
                  </>
                ) : null}

                <SecondaryButton
                  label="Remove from this list"
                  onPress={() => void dismissDeadLetter(entry.mutation.mutationId)}
                />
              </View>
            );
          })}
        </>
      ) : null}

      {settled ? (
        <EmptyState
          icon="cloud-done-outline"
          title="Nothing waiting"
          hint="Work saved in the field appears here until it reaches the server."
        />
      ) : null}
    </ScrollScreen>
  );
}

function ConflictDetail({
  loaded,
  onClose,
  onResolved
}: {
  loaded: LoadedConflict;
  onClose: () => void;
  onResolved: () => void;
}) {
  const { record } = useSync();
  const [choices, setChoices] = useState<Record<string, Resolution>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = isFullyResolved(loaded.conflicts, choices);
  const decided = Object.keys(choices).length;

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const payload = buildResolvedPayload(
        loaded.mutation.payload,
        loaded.serverRow,
        loaded.conflicts,
        choices
      );

      // Re-based on the version the server actually holds, so the resolved write
      // is no longer stale and will be accepted.
      if (loaded.serverVersion !== null) {
        payload.p_base_server_version = loaded.serverVersion;
      }

      const values = Object.values(choices);
      const resolution = values.every((value) => value === "keep_local")
        ? "keep_local"
        : values.every((value) => value === "keep_server")
          ? "keep_server"
          : "combined";

      // Audited before the write, so a resolution is on record even if the
      // write itself is queued and sends later. Field names only, never the
      // contested clinical text.
      await supabase.rpc("record_conflict_resolution", {
        p_entity_type: loaded.mutation.entityType,
        p_entity_id: loaded.mutation.entityId,
        p_resolution: resolution,
        p_fields: loaded.conflicts.map((conflict) => conflict.field.param)
      });

      await record({
        mutationId: loaded.mutation.mutationId,
        entityType: loaded.mutation.entityType,
        entityId: loaded.mutation.entityId,
        operation: loaded.mutation.operation,
        rpcName: loaded.mutation.rpcName,
        baseServerVersion: loaded.serverVersion,
        payload
      });

      onResolved();
    } catch (thrown: unknown) {
      setError(thrown instanceof Error ? thrown.message : "Could not apply your choice.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollScreen>
      <Card>
        <SectionTitle>{describeEntity(loaded.mutation)}</SectionTitle>
        <Muted>
          The other version was saved
          {loaded.serverUpdatedAt ? ` ${new Date(loaded.serverUpdatedAt).toLocaleString()}` : ""}
          {loaded.serverDeviceName ? ` from ${loaded.serverDeviceName}` : ""}.
        </Muted>
        <Muted>Choose for each field. Nothing is sent until you have decided all of them.</Muted>
        {loaded.conflicts.length > 0 ? (
          <ProgressBar
            label="Decided"
            done={decided}
            total={loaded.conflicts.length}
            tone={complete ? "good" : "warn"}
          />
        ) : null}
      </Card>

      {loaded.conflicts.length === 0 ? (
        <Card>
          <Body>These versions now agree. Nothing needs deciding.</Body>
          <PrimaryButton label="Done" onPress={onResolved} />
        </Card>
      ) : null}

      {loaded.conflicts.map((conflict) => {
        const choice = choices[conflict.field.param];
        return (
          <Card key={conflict.field.param}>
            <FieldLabel>{conflict.field.label}</FieldLabel>

            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: choice === "keep_local" }}
              style={[styles.option, choice === "keep_local" && styles.optionChosen]}
              onPress={() =>
                setChoices((current) => ({ ...current, [conflict.field.param]: "keep_local" }))
              }
            >
              <View style={styles.optionHead}>
                <Ionicons
                  name={choice === "keep_local" ? "radio-button-on" : "radio-button-off"}
                  size={16}
                  color={choice === "keep_local" ? palette.green : palette.quiet}
                />
                <Text style={styles.optionLabel}>On this phone</Text>
              </View>
              <Text style={styles.optionValue}>{conflict.local ?? "(blank)"}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: choice === "keep_server" }}
              style={[styles.option, choice === "keep_server" && styles.optionChosen]}
              onPress={() =>
                setChoices((current) => ({ ...current, [conflict.field.param]: "keep_server" }))
              }
            >
              <View style={styles.optionHead}>
                <Ionicons
                  name={choice === "keep_server" ? "radio-button-on" : "radio-button-off"}
                  size={16}
                  color={choice === "keep_server" ? palette.green : palette.quiet}
                />
                <Text style={styles.optionLabel}>From the other device</Text>
              </View>
              <Text style={styles.optionValue}>{conflict.server ?? "(blank)"}</Text>
            </Pressable>
          </Card>
        );
      })}

      <Card>
        {error ? <ErrorText>{error}</ErrorText> : null}
        {!complete && loaded.conflicts.length > 0 ? (
          <Muted>{loaded.conflicts.length - decided} still to decide.</Muted>
        ) : null}
        <PrimaryButton
          label={busy ? "Applying…" : "Apply my choices"}
          disabled={busy || !complete}
          onPress={() => void apply()}
        />
        <SecondaryButton label="Back" onPress={onClose} />
      </Card>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  state: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.lg,
    borderRadius: radius,
    borderWidth: hairline
  },
  stateGood: { backgroundColor: palette.greenSoft, borderColor: palette.greenSoft },
  stateBusy: { backgroundColor: palette.surface, borderColor: palette.line },
  stateBody: { flex: 1, gap: 2 },
  stateTitle: { ...type.strong, color: palette.ink },
  stateDetail: { ...type.small, fontSize: 12, color: palette.quiet },
  conflictRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    backgroundColor: palette.amberSoft,
    borderRadius: radius,
    borderWidth: hairline,
    borderColor: palette.amber
  },
  pressed: { opacity: 0.7 },
  deadRow: {
    gap: space.sm,
    padding: space.md,
    backgroundColor: palette.surface,
    borderRadius: radius,
    borderWidth: hairline,
    borderColor: palette.line
  },
  deadHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  reason: { ...type.small, fontSize: 12, color: palette.red },
  reasonHint: { ...type.small, fontSize: 12, color: palette.quiet },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...type.strong, color: palette.ink },
  rowMeta: { ...type.small, fontSize: 12, color: palette.quiet },
  option: {
    borderWidth: hairline,
    borderColor: palette.line,
    borderRadius: radiusControl,
    padding: space.md,
    gap: space.xs,
    minHeight: 60
  },
  // The chosen side carries a border weight, a filled background and a marked
  // radio, not colour alone, so the choice is legible to a vet who cannot
  // distinguish them.
  optionChosen: { borderColor: palette.green, borderWidth: 3, backgroundColor: palette.greenSoft },
  optionHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  optionLabel: { fontFamily: fonts.semibold, fontSize: 12, color: palette.quiet },
  optionValue: { ...type.small, fontSize: 15, color: palette.ink, lineHeight: 21 }
});
