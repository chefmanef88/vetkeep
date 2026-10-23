import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  ANAESTHESIA_LABELS,
  ANAESTHESIA_TYPES,
  OUTCOME_LABELS,
  PROCEDURE_KINDS,
  PROCEDURE_KIND_LABELS,
  PROCEDURE_OUTCOMES,
  anaesthesiaProblem,
  procedureSuggestions,
  protocolFieldsFor
} from "@vetkeep/domain";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import { ConsentBlock, type ConsentRow } from "@/features/practice/consent-block";
import {
  applyQueuedWithdrawals,
  queuedConsents,
  queuedProcedures,
  withQueued
} from "@/features/practice/queued-records";
import { useSync } from "@/sync/sync-provider";
import { definedArgs, optionalNumber, optionalText } from "@vetkeep/contracts";
import { Collapsible, OptionChips } from "@/ui/elements";
import { FieldLabel, Muted, Segmented } from "@/ui/practice-components";
import { ErrorText, Field, PrimaryButton } from "@/ui/components";
import { fonts, hairline, palette, radiusControl, space, type } from "@/ui/tokens";

/**
 * Surgery performed during this consultation, with its anaesthetic.
 *
 * The protocol fields shown follow the anaesthetic chosen: a general asks for
 * premedication, induction, maintenance and monitoring; a local asks for none
 * of them, because there is nothing to induce and nothing to maintain. Showing
 * fields that cannot apply teaches the vet to skip fields, and that is how the
 * ones that matter start being skipped.
 *
 * A group gets a count, exactly as a treatment does — a disbudding session is
 * one afternoon across the pen, not forty operations. An individual does not,
 * and the server refuses it there.
 */

export type ProcedureRow = {
  id: string;
  procedure_name: string;
  procedure_kind: string;
  anaesthesia: string;
  animals_treated: number | null;
  duration_minutes: number | null;
  premedication: string | null;
  induction_agent: string | null;
  maintenance_agent: string | null;
  analgesia: string | null;
  monitoring: string | null;
  pre_op_assessment: string | null;
  post_op_instructions: string | null;
  complications: string | null;
  outcome: string;
  assistant: string | null;
  performed_at: string;
};

export function SurgerySection({
  visitId,
  species,
  isGroup,
  editable
}: {
  visitId: string;
  species: string;
  isGroup: boolean;
  editable: boolean;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("routine");
  const [anaesthesia, setAnaesthesia] = useState<string>("none");
  const [premedication, setPremedication] = useState("");
  const [induction, setInduction] = useState("");
  const [maintenance, setMaintenance] = useState("");
  const [analgesia, setAnalgesia] = useState("");
  const [monitoring, setMonitoring] = useState("");
  const [preOp, setPreOp] = useState("");
  const [postOp, setPostOp] = useState("");
  const [complications, setComplications] = useState("");
  const [outcome, setOutcome] = useState<string>("uneventful");
  const [assistant, setAssistant] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [animalsTreated, setAnimalsTreated] = useState("");
  // Closed until asked for, and closed again once a procedure is recorded.
  // An open form sitting over the thing it just created invites recording it
  // twice, and hides the entry the vet wants to check.
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the queued consents are read here. The procedure write itself still
  // goes straight to the server; converting it is its own step, because
  // surgery's update path carries a base_server_version.
  const { record: queueWrite, pending } = useSync();

  const { data, reload } = useQuery<{
    procedures: ProcedureRow[];
    consents: ConsentRow[];
  }>(async () => {
    const { data: rows, error: rpcError } = await supabase
      .from("surgical_procedures")
      .select(
        "id, procedure_name, procedure_kind, anaesthesia, animals_treated, duration_minutes, premedication, induction_agent, maintenance_agent, analgesia, monitoring, pre_op_assessment, post_op_instructions, complications, outcome, assistant, performed_at"
      )
      .eq("visit_id", visitId)
      .is("deleted_at", null)
      .order("performed_at", { ascending: true });
    if (rpcError) throw new Error(rpcError.message);

    // Fetched beside the procedures but not allowed to take them down with it.
    // When the consents table was missing from an environment this threw, the
    // whole query failed, and the surgery list rendered empty — so a schema gap
    // in one table looked like "no procedures recorded" in another. A consent
    // that cannot be read is worth saying nothing about; the procedures are
    // still worth showing.
    const { data: consentRows } = await supabase
      .from("consents")
      .select(
        "id, surgical_procedure_id, granted_by_name, granted_by_capacity, method, witness_name, risks_explained, granted_at, withdrawn_at, withdrawal_reason"
      )
      .eq("visit_id", visitId)
      .order("granted_at", { ascending: true });

    return {
      procedures: (rows ?? []) as ProcedureRow[],
      consents: (consentRows ?? []) as (ConsentRow & { surgical_procedure_id: string | null })[]
    };
  }, [visitId]);

  // Consent is queued now, so a consent taken with no signal is not on the
  // server yet. Without this merge, saving one offline would look like it had
  // been discarded.
  const queuedSurgicalConsents = queuedConsents(pending, visitId, "surgery");
  // Server rows plus anything waiting to send, so a procedure recorded with
  // no signal does not vanish the moment it is saved.
  const procedures = withQueued(data?.procedures ?? [], queuedProcedures(pending, visitId));
  const allConsents = applyQueuedWithdrawals(
    withQueued(
      (data?.consents ?? []) as (ConsentRow & { surgical_procedure_id: string | null })[],
      queuedSurgicalConsents
    ),
    pending
  );
  const fields = protocolFieldsFor(anaesthesia);
  // Said while the form is being filled rather than at save time, where the
  // server would say the same thing but only after the tap.
  const protocolProblem = anaesthesiaProblem({ anaesthesia, inductionAgent: induction });
  const ready = name.trim().length >= 2 && protocolProblem === null;

  function reset() {
    setName("");
    setKind("routine");
    setAnaesthesia("none");
    setPremedication("");
    setInduction("");
    setMaintenance("");
    setAnalgesia("");
    setMonitoring("");
    setPreOp("");
    setPostOp("");
    setComplications("");
    setOutcome("uneventful");
    setAssistant("");
    setDurationMinutes("");
    setAnimalsTreated("");
  }

  async function record() {
    setBusy(true);
    setError(null);
    // Queued. Surgery in this practice happens on a table in a yard as often
    // as anywhere else, and the anaesthetic protocol is written down while it
    // is still in the vet's head.
    const id = globalThis.crypto.randomUUID();
    try {
      await queueWrite({
        entityType: "surgical_procedure",
        entityId: id,
        operation: "create",
        rpcName: "record_surgical_procedure",
        payload: definedArgs({
          p_id: id,
          p_visit_id: visitId,
          p_procedure_name: name.trim(),
          p_procedure_kind: kind,
          p_anaesthesia: anaesthesia,
          // Only sent for a group. The server refuses it on an individual, where
          // the count is always one.
          p_animals_treated: isGroup ? optionalNumber(animalsTreated) : undefined,
          p_duration_minutes: optionalNumber(durationMinutes),
          p_premedication: optionalText(premedication),
          p_induction_agent: optionalText(induction),
          p_maintenance_agent: optionalText(maintenance),
          p_analgesia: optionalText(analgesia),
          p_monitoring: optionalText(monitoring),
          p_pre_op_assessment: optionalText(preOp),
          p_post_op_instructions: optionalText(postOp),
          p_complications: optionalText(complications),
          p_outcome: outcome,
          p_assistant: optionalText(assistant)
        })
      });
    } catch (thrown: unknown) {
      setBusy(false);
      setError(thrown instanceof Error ? thrown.message : "Could not save on this phone.");
      return;
    }
    setBusy(false);
    reset();
    setAdding(false);
    reload();
  }

  return (
    <Collapsible
      title="Surgery"
      icon="cut"
      hint={
        procedures.length === 0
          ? "None recorded"
          : `${procedures.length} recorded${procedures.some((p) => p.outcome === "died") ? " · one died" : ""}`
      }
    >
      {procedures.map((entry) => (
        <View key={entry.id} style={styles.entry}>
          <View style={styles.entryHead}>
            <Text style={styles.entryName}>{entry.procedure_name}</Text>
            <Text
              style={[
                styles.outcome,
                entry.outcome === "died" && styles.outcomeBad,
                entry.outcome === "complication" && styles.outcomeWarn
              ]}
            >
              {OUTCOME_LABELS[entry.outcome as keyof typeof OUTCOME_LABELS] ?? entry.outcome}
            </Text>
          </View>
          <Text style={styles.entryMeta}>
            {PROCEDURE_KIND_LABELS[entry.procedure_kind as keyof typeof PROCEDURE_KIND_LABELS] ??
              entry.procedure_kind}
            {" · "}
            {ANAESTHESIA_LABELS[entry.anaesthesia as keyof typeof ANAESTHESIA_LABELS] ??
              entry.anaesthesia}
            {entry.anaesthesia !== "none" ? " anaesthesia" : ""}
            {entry.animals_treated ? ` · ${entry.animals_treated} animals` : ""}
            {entry.duration_minutes ? ` · ${entry.duration_minutes} min` : ""}
          </Text>
          {entry.induction_agent ? (
            <Text style={styles.entryDetail}>Induction {entry.induction_agent}</Text>
          ) : null}
          {entry.maintenance_agent ? (
            <Text style={styles.entryDetail}>Maintenance {entry.maintenance_agent}</Text>
          ) : null}
          {entry.analgesia ? (
            <Text style={styles.entryDetail}>Analgesia {entry.analgesia}</Text>
          ) : null}
          {entry.complications ? (
            <Text style={styles.entryComplication}>{entry.complications}</Text>
          ) : null}
          {entry.post_op_instructions ? (
            <Text style={styles.entryDetail}>Aftercare: {entry.post_op_instructions}</Text>
          ) : null}

          {/* Consent belongs to the procedure, not to the consultation: two
              operations in one visit can have been agreed to separately, or
              one of them not at all. */}
          <ConsentBlock
            visitId={visitId}
            subject={{ kind: "surgery", procedureId: entry.id }}
            consents={allConsents.filter((c) => c.surgical_procedure_id === entry.id)}
            editable={editable}
            onChanged={reload}
          />
        </View>
      ))}

      {procedures.length === 0 && !editable ? <Muted>No surgery recorded.</Muted> : null}

      {editable && !adding ? (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.add, pressed && styles.pressed]}
          onPress={() => setAdding(true)}
        >
          <Ionicons name="add" size={16} color={palette.brandInk} />
          <Text style={styles.addText}>Record a procedure</Text>
        </Pressable>
      ) : null}

      {editable && adding ? (
        <View style={styles.form}>
          <FieldLabel>Procedure</FieldLabel>
          <Field value={name} onChangeText={setName} placeholder="What was done" />
          {/* Typing "Ovariohysterectomy" on a phone in a yard is the friction
              that ends with "spay" in the record and nothing searchable later. */}
          <View style={styles.suggestions}>
            {procedureSuggestions(species).map((s) => (
              <Pressable
                key={s.label}
                accessibilityRole="button"
                style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
                onPress={() => {
                  setName(s.label);
                  setKind(s.kind);
                }}
              >
                <Text style={styles.suggestionText}>{s.label}</Text>
              </Pressable>
            ))}
          </View>

          <FieldLabel>Kind</FieldLabel>
          <Segmented
            options={PROCEDURE_KINDS.map((value) => ({
              value,
              label: PROCEDURE_KIND_LABELS[value]
            }))}
            value={kind}
            onChange={setKind}
          />

          <FieldLabel>Anaesthesia</FieldLabel>
          <OptionChips
            options={ANAESTHESIA_TYPES.map((value) => ({
              value,
              label: ANAESTHESIA_LABELS[value]
            }))}
            value={anaesthesia}
            onChange={setAnaesthesia}
          />

          {fields.premedication ? (
            <>
              <FieldLabel>Premedication</FieldLabel>
              <Field
                value={premedication}
                onChangeText={setPremedication}
                placeholder="Acepromazine 0.03 mg/kg IM"
              />
            </>
          ) : null}

          {fields.induction ? (
            <>
              <FieldLabel>Induction agent</FieldLabel>
              <Field
                value={induction}
                onChangeText={setInduction}
                placeholder="Propofol 4 mg/kg IV"
              />
            </>
          ) : null}

          {fields.maintenance ? (
            <>
              <FieldLabel>Maintenance</FieldLabel>
              <Field
                value={maintenance}
                onChangeText={setMaintenance}
                placeholder="Isoflurane in oxygen"
              />
            </>
          ) : null}

          <FieldLabel>Analgesia</FieldLabel>
          <Field
            value={analgesia}
            onChangeText={setAnalgesia}
            placeholder="Meloxicam 0.2 mg/kg SC"
          />

          {fields.monitoring ? (
            <>
              <FieldLabel>Monitoring</FieldLabel>
              <Field
                multiline
                value={monitoring}
                onChangeText={setMonitoring}
                placeholder="Heart rate, respiration, mucous membranes"
              />
            </>
          ) : null}

          <FieldLabel>Before: assessment</FieldLabel>
          <Field
            multiline
            value={preOp}
            onChangeText={setPreOp}
            placeholder="Fasting, hydration, anything that changed the plan"
          />

          <FieldLabel>After: instructions for the owner</FieldLabel>
          <Field
            multiline
            value={postOp}
            onChangeText={setPostOp}
            placeholder="Lead walks only for ten days. Sutures out day 10."
          />

          {isGroup ? (
            <>
              <FieldLabel>Animals treated</FieldLabel>
              <Field
                value={animalsTreated}
                onChangeText={setAnimalsTreated}
                keyboardType="number-pad"
                placeholder="18"
              />
            </>
          ) : null}

          <View style={styles.pairRow}>
            <View style={styles.pairItem}>
              <FieldLabel>Minutes</FieldLabel>
              <Field
                value={durationMinutes}
                onChangeText={setDurationMinutes}
                keyboardType="number-pad"
                placeholder="45"
              />
            </View>
            <View style={styles.pairItem}>
              <FieldLabel>Assisted by</FieldLabel>
              <Field value={assistant} onChangeText={setAssistant} placeholder="Optional" />
            </View>
          </View>

          <FieldLabel>Outcome</FieldLabel>
          <Segmented
            options={PROCEDURE_OUTCOMES.map((value) => ({
              value,
              label: OUTCOME_LABELS[value]
            }))}
            value={outcome}
            onChange={setOutcome}
          />

          {outcome === "uneventful" ? null : (
            <>
              <FieldLabel>What happened</FieldLabel>
              <Field
                multiline
                value={complications}
                onChangeText={setComplications}
                placeholder="What went wrong, and what was done about it"
              />
            </>
          )}

          {protocolProblem ? (
            <View style={styles.warn}>
              <Ionicons name="alert-circle-outline" size={16} color={palette.amber} />
              <Text style={styles.warnText}>{protocolProblem}</Text>
            </View>
          ) : null}
          {error ? <ErrorText>{error}</ErrorText> : null}

          <PrimaryButton
            label={busy ? "Recording…" : "Record procedure"}
            disabled={busy || !ready}
            onPress={() => void record()}
          />
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
            onPress={() => {
              reset();
              setAdding(false);
            }}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
    </Collapsible>
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
  entryName: { ...type.strong, fontSize: 15, color: palette.ink, flex: 1 },
  outcome: { ...type.small, fontSize: 12, color: palette.green, fontFamily: fonts.semibold },
  outcomeWarn: { color: palette.amber },
  outcomeBad: { color: palette.red },
  entryMeta: { ...type.small, fontSize: 12.5, color: palette.quiet },
  entryDetail: { ...type.small, fontSize: 12.5, color: palette.ink },
  entryComplication: { ...type.small, fontSize: 12.5, color: palette.red },
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radiusControl,
    borderWidth: hairline,
    borderColor: palette.line,
    alignSelf: "flex-start",
    marginTop: space.sm
  },
  addText: { ...type.small, fontSize: 13.5, color: palette.brandInk, fontFamily: fonts.medium },
  cancel: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  cancelText: { ...type.small, fontSize: 13, color: palette.quiet },
  form: { gap: space.sm, paddingTop: space.md },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 2 },
  suggestion: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radiusControl,
    backgroundColor: palette.ground,
    borderWidth: hairline,
    borderColor: palette.line
  },
  suggestionText: { ...type.small, fontSize: 12.5, color: palette.brandInk },
  pressed: { opacity: 0.7 },
  pairRow: { flexDirection: "row", gap: space.md },
  pairItem: { flex: 1 },
  warn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: palette.amberSoft,
    borderRadius: radiusControl,
    padding: space.md
  },
  warnText: { ...type.small, fontSize: 12.5, color: palette.amber, flex: 1 }
});
