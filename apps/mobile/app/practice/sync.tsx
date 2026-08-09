import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import {
  buildResolvedPayload,
  isFullyResolved,
  type OutboundMutation,
  type Resolution
} from "@vetkeep/sync";
import { supabase } from "@/lib/supabase";
import { useSync } from "@/sync/sync-provider";
import { describeEntity, loadConflict, type LoadedConflict } from "@/sync/conflict-loader";
import { Body, ErrorText, PrimaryButton, SecondaryButton } from "@/ui/components";
import {
  Card,
  FieldLabel,
  Muted,
  Pill,
  ScrollScreen,
  SectionTitle,
  palette
} from "@/ui/practice-components";
import { radiusControl } from "@/ui/tokens";

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
  const { pendingCount, conflicts, deadLetters, lastSyncAt, flush, dismissDeadLetter } = useSync();
  const [open, setOpen] = useState<LoadedConflict | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <ScrollScreen>
      <Card>
        <SectionTitle>Sync</SectionTitle>
        <Muted>
          {pendingCount === 0
            ? "Everything on this phone has been sent."
            : `${pendingCount} item${pendingCount === 1 ? "" : "s"} waiting to send.`}
        </Muted>
        {lastSyncAt ? <Muted>Last sent {new Date(lastSyncAt).toLocaleString()}</Muted> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
        {loading ? <ActivityIndicator /> : null}
        <PrimaryButton label="Send now" onPress={() => void flush()} />
      </Card>

      <Card>
        <SectionTitle>Needs your decision</SectionTitle>
        {conflicts.length === 0 ? (
          <Muted>Nothing is in conflict.</Muted>
        ) : (
          <Muted>
            Another device changed these while this phone was offline. Nothing is applied until you
            choose.
          </Muted>
        )}
        {conflicts.map((mutation) => (
          <Pressable
            key={mutation.mutationId}
            accessibilityRole="button"
            style={styles.conflictRow}
            onPress={() => void openConflict(mutation)}
          >
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{describeEntity(mutation)}</Text>
              <Muted>Changed on another device</Muted>
            </View>
            <Pill label="review" tone="warn" />
          </Pressable>
        ))}
      </Card>

      {deadLetters.length > 0 ? (
        <Card>
          <SectionTitle>Could not be sent</SectionTitle>
          <Muted>
            The server refused these. They are kept here rather than discarded, so nothing is lost
            without you seeing it.
          </Muted>
          {deadLetters.map((entry) => (
            <View key={entry.mutation.mutationId} style={styles.deadRow}>
              <Text style={styles.rowTitle}>{describeEntity(entry.mutation)}</Text>
              <Muted>{entry.reason}</Muted>
              <Muted>{new Date(entry.failedAt).toLocaleString()}</Muted>
              <SecondaryButton
                label="Remove from this list"
                onPress={() => void dismissDeadLetter(entry.mutation.mutationId)}
              />
            </View>
          ))}
        </Card>
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
              <Text style={styles.optionLabel}>On this phone</Text>
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
              <Text style={styles.optionLabel}>From the other device</Text>
              <Text style={styles.optionValue}>{conflict.server ?? "(blank)"}</Text>
            </Pressable>
          </Card>
        );
      })}

      <Card>
        {error ? <ErrorText>{error}</ErrorText> : null}
        {!complete && loaded.conflicts.length > 0 ? (
          <Muted>{loaded.conflicts.length - Object.keys(choices).length} still to decide.</Muted>
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
  conflictRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    minHeight: 56
  },
  deadRow: {
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: "700", color: palette.ink },
  option: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: radiusControl,

    padding: 12,
    gap: 4,
    minHeight: 60
  },
  // The chosen side carries a border weight and a filled background, not colour
  // alone, so the choice is legible to a vet who cannot distinguish them.
  optionChosen: { borderColor: palette.green, borderWidth: 3, backgroundColor: palette.greenSoft },
  optionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: palette.quiet,
    textTransform: "uppercase"
  },
  optionValue: { fontSize: 15, color: palette.ink, lineHeight: 21 }
});
