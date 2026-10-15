import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  EUTHANASIA_METHODS,
  EUTHANASIA_REASONS,
  METHOD_LABELS_EUTHANASIA,
  REASON_LABELS,
  euthanasiaProblem,
  type EuthanasiaMethod,
  type EuthanasiaReason
} from "@vetkeep/domain";
import { definedArgs, optionalNumber, optionalText } from "@vetkeep/contracts";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import { ConsentBlock, type ConsentRow } from "@/features/practice/consent-block";
import { confirmWithDevice } from "@/security/confirm-with-device";
import { FieldLabel } from "@/ui/practice-components";
import { OptionChips } from "@/ui/elements";
import { ErrorText, Field } from "@/ui/components";
import { fonts, hairline, palette, radius, radiusControl, space, type } from "@/ui/tokens";

/**
 * Euthanasia, which ends the folder.
 *
 * Deliberately not another collapsible sitting among treatments and surgery.
 * Before it has happened it is one quiet line at the very bottom, because a
 * terminal act should take a deliberate reach rather than sit under the
 * thumb beside "add a treatment". After it has happened it is the first thing
 * on the record and cannot be collapsed away, because it is the most
 * important fact about the animal and the next person to open the folder must
 * not have to scroll to find it.
 *
 * Recording it is confirmed with the device credential, as removing a folder
 * is. There is no undo: it writes the death and marks the animal deceased in
 * one transaction, and nothing in this application reverses that.
 */

export type EuthanasiaRow = {
  id: string;
  reason: string;
  reason_detail: string;
  method: string;
  agent: string | null;
  death_confirmed: boolean;
  death_confirmed_by: string | null;
  animals_count: number | null;
  carcass_disposal: string | null;
  performed_at: string;
};

export function EuthanasiaSection({
  visitId,
  isGroup,
  isFoodAnimal,
  editable
}: {
  visitId: string;
  isGroup: boolean;
  isFoodAnimal: boolean;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("poor_prognosis");
  const [detail, setDetail] = useState("");
  const [method, setMethod] = useState<string>("injectable");
  const [agent, setAgent] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedBy, setConfirmedBy] = useState("");
  const [count, setCount] = useState("");
  const [disposal, setDisposal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, reload } = useQuery<{
    record: EuthanasiaRow | null;
    consents: (ConsentRow & { euthanasia_record_id: string | null })[];
  }>(async () => {
    const { data: rows, error: rpcError } = await supabase
      .from("euthanasia_records")
      .select(
        "id, reason, reason_detail, method, agent, death_confirmed, death_confirmed_by, animals_count, carcass_disposal, performed_at"
      )
      .eq("visit_id", visitId)
      .is("deleted_at", null)
      .maybeSingle();
    if (rpcError) throw new Error(rpcError.message);

    // Allowed to come back empty rather than failing the record, for the same
    // reason it is on the surgery section: a gap in one table should not hide
    // another.
    const { data: consentRows } = await supabase
      .from("consents")
      .select(
        "id, euthanasia_record_id, granted_by_name, granted_by_capacity, method, witness_name, risks_explained, granted_at, withdrawn_at, withdrawal_reason"
      )
      .eq("visit_id", visitId)
      .eq("consent_for", "euthanasia");

    return {
      record: (rows ?? null) as EuthanasiaRow | null,
      consents: (consentRows ?? []) as (ConsentRow & { euthanasia_record_id: string | null })[]
    };
  }, [visitId]);

  const record = data?.record ?? null;
  const consents = data?.consents ?? [];
  const problem = euthanasiaProblem({
    reasonDetail: detail,
    method,
    agent,
    deathConfirmed: confirmed,
    deathConfirmedBy: confirmedBy
  });

  async function submit() {
    setError(null);
    // The device credential, as for removing a folder. There is no undo, and
    // the animal is marked deceased in the same transaction.
    const ok = await confirmWithDevice("Confirm recording this euthanasia");
    if (!ok) return;

    setBusy(true);
    const { error: rpcError } = await supabase.rpc(
      "record_euthanasia",
      definedArgs({
        p_id: globalThis.crypto.randomUUID(),
        p_visit_id: visitId,
        p_reason: reason,
        p_reason_detail: detail.trim(),
        p_method: method,
        p_agent: optionalText(agent),
        p_death_confirmed: confirmed,
        p_death_confirmed_by: optionalText(confirmedBy),
        p_animals_count: isGroup ? optionalNumber(count) : undefined,
        p_carcass_disposal: optionalText(disposal)
      })
    );
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setOpen(false);
    reload();
  }

  if (record) {
    return (
      <View style={styles.recorded}>
        <View style={styles.recordedHead}>
          <Ionicons name="remove-circle" size={20} color={palette.red} />
          <Text style={styles.recordedTitle}>
            {record.animals_count
              ? `${record.animals_count} animals euthanised`
              : "This animal was euthanised"}
          </Text>
        </View>
        <Text style={styles.reason}>
          {REASON_LABELS[record.reason as EuthanasiaReason] ?? record.reason}
        </Text>
        <Text style={styles.detail}>{record.reason_detail}</Text>
        <Text style={styles.detail}>
          {METHOD_LABELS_EUTHANASIA[record.method as EuthanasiaMethod] ?? record.method}
          {record.agent ? ` · ${record.agent}` : ""}
        </Text>
        <Text style={record.death_confirmed ? styles.detail : styles.unconfirmed}>
          {record.death_confirmed
            ? `Death confirmed — ${record.death_confirmed_by}`
            : "Death not recorded as confirmed."}
        </Text>
        {record.carcass_disposal ? (
          <Text style={styles.detail}>Carcass: {record.carcass_disposal}</Text>
        ) : null}

        <ConsentBlock
          visitId={visitId}
          subject={{ kind: "euthanasia", euthanasiaId: record.id }}
          consents={consents}
          editable={editable}
          onChanged={reload}
        />
      </View>
    );
  }

  if (!editable) return null;

  if (!open) {
    // One quiet line, at the bottom, in the colour of the thing it does. Not a
    // button competing with "add a treatment".
    return (
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.entry, pressed && styles.pressed]}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.entryText}>Record a euthanasia</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.form}>
      <View style={styles.formHead}>
        <Ionicons name="alert-circle" size={18} color={palette.red} />
        <Text style={styles.formTitle}>Euthanasia</Text>
      </View>
      <Text style={styles.warning}>
        This ends the folder. The animal is marked deceased and nothing here undoes it.
      </Text>

      <FieldLabel>Reason</FieldLabel>
      <OptionChips
        options={EUTHANASIA_REASONS.map((value) => ({ value, label: REASON_LABELS[value] }))}
        value={reason}
        onChange={setReason}
      />

      <FieldLabel>In your own words</FieldLabel>
      <Field
        multiline
        value={detail}
        onChangeText={setDetail}
        placeholder="Why this was the right decision, and what led to it"
      />

      <FieldLabel>Method</FieldLabel>
      <OptionChips
        options={EUTHANASIA_METHODS.map((value) => ({
          value,
          label: METHOD_LABELS_EUTHANASIA[value]
        }))}
        value={method}
        onChange={setMethod}
      />

      {method === "injectable" ? (
        <>
          <FieldLabel>What was given</FieldLabel>
          <Field value={agent} onChangeText={setAgent} placeholder="Pentobarbital 150 mg/kg IV" />
        </>
      ) : null}

      {isGroup ? (
        <>
          <FieldLabel>How many</FieldLabel>
          <Field value={count} onChangeText={setCount} keyboardType="number-pad" placeholder="40" />
        </>
      ) : null}

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: confirmed }}
        style={({ pressed }) => [styles.check, pressed && styles.pressed]}
        onPress={() => setConfirmed(!confirmed)}
      >
        <Ionicons
          name={confirmed ? "checkbox" : "square-outline"}
          size={20}
          color={confirmed ? palette.brand : palette.quiet}
        />
        <Text style={styles.checkText}>I confirmed death</Text>
      </Pressable>

      {confirmed ? (
        <>
          <FieldLabel>How you confirmed it</FieldLabel>
          <Field
            value={confirmedBy}
            onChangeText={setConfirmedBy}
            placeholder="Absent heartbeat and corneal reflex after five minutes"
          />
        </>
      ) : null}

      {/* Asked of food animals because the question does not end at death: an
          animal given a barbiturate must never reach the food chain. */}
      {isFoodAnimal ? (
        <>
          <FieldLabel>What became of the carcass</FieldLabel>
          <Field
            multiline
            value={disposal}
            onChangeText={setDisposal}
            placeholder="Buried, incinerated, condemned — and where"
          />
        </>
      ) : null}

      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Pressable
        accessibilityRole="button"
        disabled={busy || problem !== null}
        style={({ pressed }) => [
          styles.danger,
          (busy || problem !== null) && styles.dangerOff,
          pressed && styles.pressed
        ]}
        onPress={() => void submit()}
      >
        <Text style={styles.dangerText}>{busy ? "Recording…" : "Record euthanasia"}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
        onPress={() => setOpen(false)}
      >
        <Text style={styles.cancelText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  recorded: {
    gap: 4,
    backgroundColor: palette.redSoft,
    borderRadius: radius,
    padding: space.lg,
    marginBottom: space.lg
  },
  recordedHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  recordedTitle: { ...type.strong, fontSize: 16, color: palette.red, flex: 1 },
  reason: { ...type.strong, fontSize: 14, color: palette.ink },
  detail: { ...type.small, fontSize: 13, color: palette.ink },
  unconfirmed: { ...type.small, fontSize: 13, color: palette.amber, fontFamily: fonts.semibold },
  entry: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    marginTop: space.xl,
    marginBottom: space.lg
  },
  entryText: { ...type.small, fontSize: 13, color: palette.quiet },
  form: {
    gap: space.sm,
    backgroundColor: palette.surface,
    borderRadius: radius,
    borderWidth: hairline,
    borderColor: palette.red,
    padding: space.lg,
    marginTop: space.xl,
    marginBottom: space.lg
  },
  formHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  formTitle: { ...type.heading, fontSize: 18, color: palette.red },
  warning: { ...type.small, fontSize: 13, color: palette.red, paddingBottom: space.sm },
  check: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44 },
  checkText: { ...type.small, fontSize: 14, color: palette.ink },
  problem: { ...type.small, fontSize: 12.5, color: palette.amber },
  danger: {
    minHeight: 52,
    borderRadius: radiusControl,
    backgroundColor: palette.red,
    alignItems: "center",
    justifyContent: "center"
  },
  dangerOff: { opacity: 0.4 },
  dangerText: { fontFamily: fonts.semibold, fontSize: 15, color: palette.surface },
  cancel: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  cancelText: { ...type.small, fontSize: 13, color: palette.quiet },
  pressed: { opacity: 0.75 }
});
