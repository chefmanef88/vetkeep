import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  CAPACITY_LABELS,
  CONSENT_CAPACITIES,
  CONSENT_METHODS,
  METHOD_LABELS,
  consentProblem,
  describeConsent
} from "@vetkeep/domain";
import { definedArgs, optionalText } from "@vetkeep/contracts";
import { supabase } from "@/lib/supabase";
import { FieldLabel } from "@/ui/practice-components";
import { OptionChips } from "@/ui/elements";
import { ErrorText, Field } from "@/ui/components";
import { fonts, hairline, palette, radiusControl, space, type } from "@/ui/tokens";

/**
 * The consent for one procedure.
 *
 * A missing consent is shown rather than prevented. Refusing to record surgery
 * until consent is typed sounds stricter and is worse: a vet mid-caesarean
 * will not stop to fill a form, so a blocking system produces either a
 * fabricated consent or no record of the operation at all. A record that says
 * plainly "no consent recorded" is more honest than both, and it is the thing
 * a reader needs to see.
 *
 * Nothing here can be edited. A consent is written once; a change of mind is a
 * withdrawal recorded beside it, never a rewrite. The database enforces that
 * with a trigger — this just does not offer the option.
 */

export type ConsentRow = {
  id: string;
  granted_by_name: string;
  granted_by_capacity: string;
  method: string;
  witness_name: string | null;
  risks_explained: string;
  granted_at: string;
  withdrawn_at: string | null;
  withdrawal_reason: string | null;
};

export function ConsentBlock({
  visitId,
  subject,
  consents,
  editable,
  onChanged
}: {
  visitId: string;
  /**
   * What is being consented to. A discriminated union rather than two optional
   * ids, so a caller cannot pass neither — or both, which would be a consent
   * for two different things at once.
   */
  subject: { kind: "surgery"; procedureId: string } | { kind: "euthanasia"; euthanasiaId: string };
  consents: ConsentRow[];
  editable: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState<string>("owner");
  const [method, setMethod] = useState<string>("verbal");
  const [witness, setWitness] = useState("");
  const [risks, setRisks] = useState("");
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = consentProblem({
    grantedByName: name,
    method,
    witnessName: witness,
    risksExplained: risks
  });
  const standing = consents.filter((c) => c.withdrawn_at === null);

  async function record() {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc(
      "record_consent",
      definedArgs({
        p_id: globalThis.crypto.randomUUID(),
        p_visit_id: visitId,
        p_consent_for: subject.kind,
        p_surgical_procedure_id: subject.kind === "surgery" ? subject.procedureId : undefined,
        p_euthanasia_record_id: subject.kind === "euthanasia" ? subject.euthanasiaId : undefined,
        p_granted_by_name: name.trim(),
        p_granted_by_capacity: capacity,
        p_method: method,
        p_witness_name: optionalText(witness),
        p_risks_explained: risks.trim()
      })
    );
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setName("");
    setWitness("");
    setRisks("");
    setMethod("verbal");
    setCapacity("owner");
    setOpen(false);
    onChanged();
  }

  async function withdraw(id: string) {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("withdraw_consent", {
      p_id: id,
      p_reason: withdrawReason.trim()
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setWithdrawing(null);
    setWithdrawReason("");
    onChanged();
  }

  return (
    <View style={styles.wrap}>
      {consents.map((c) => (
        <View key={c.id} style={styles.consent}>
          <View style={styles.row}>
            <Ionicons
              name={c.withdrawn_at ? "close-circle" : "shield-checkmark"}
              size={15}
              color={c.withdrawn_at ? palette.red : palette.green}
            />
            <Text style={[styles.who, c.withdrawn_at && styles.withdrawn]}>
              {describeConsent({
                grantedByName: c.granted_by_name,
                capacity: c.granted_by_capacity,
                method: c.method,
                withdrawnAt: c.withdrawn_at
              })}
            </Text>
          </View>
          {c.witness_name ? <Text style={styles.detail}>Witnessed by {c.witness_name}</Text> : null}
          {/* What they were told is the record. It is shown, not folded away. */}
          <Text style={styles.detail}>{c.risks_explained}</Text>
          {c.withdrawal_reason ? (
            <Text style={styles.withdrawnReason}>Withdrawn: {c.withdrawal_reason}</Text>
          ) : null}

          {editable && !c.withdrawn_at ? (
            withdrawing === c.id ? (
              <View style={styles.withdrawForm}>
                <Field
                  value={withdrawReason}
                  onChangeText={setWithdrawReason}
                  placeholder="Why was it withdrawn?"
                />
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy || withdrawReason.trim().length < 3}
                    style={({ pressed }) => [styles.danger, pressed && styles.pressed]}
                    onPress={() => void withdraw(c.id)}
                  >
                    <Text style={styles.dangerText}>Record withdrawal</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.quiet, pressed && styles.pressed]}
                    onPress={() => setWithdrawing(null)}
                  >
                    <Text style={styles.quietText}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.quiet, pressed && styles.pressed]}
                onPress={() => setWithdrawing(c.id)}
              >
                <Text style={styles.quietText}>Record a withdrawal</Text>
              </Pressable>
            )
          ) : null}
        </View>
      ))}

      {/* The gap, stated. A reader of this record should not have to notice an
          absence to know consent was never captured. */}
      {standing.length === 0 ? (
        <View style={styles.missing}>
          <Ionicons name="alert-circle" size={15} color={palette.amber} />
          <Text style={styles.missingText}>
            {consents.length === 0
              ? "No consent recorded for this procedure."
              : "No consent standing — the one given was withdrawn."}
          </Text>
        </View>
      ) : null}

      {editable ? (
        open ? (
          <View style={styles.form}>
            <FieldLabel>Who agreed</FieldLabel>
            <Field value={name} onChangeText={setName} placeholder="Their name" />

            <FieldLabel>In what capacity</FieldLabel>
            <OptionChips
              options={CONSENT_CAPACITIES.map((value) => ({
                value,
                label: CAPACITY_LABELS[value]
              }))}
              value={capacity}
              onChange={setCapacity}
            />

            <FieldLabel>How</FieldLabel>
            <OptionChips
              options={CONSENT_METHODS.map((value) => ({
                value,
                label: METHOD_LABELS[value]
              }))}
              value={method}
              onChange={setMethod}
            />

            {method === "verbal_witnessed" ? (
              <>
                <FieldLabel>Witness</FieldLabel>
                <Field value={witness} onChangeText={setWitness} placeholder="Who witnessed it" />
              </>
            ) : null}

            <FieldLabel>What you explained</FieldLabel>
            <Field
              multiline
              value={risks}
              onChangeText={setRisks}
              placeholder="The risks, the alternatives, the cost — in the words you used"
            />

            {problem ? <Text style={styles.problem}>{problem}</Text> : null}
            {error ? <ErrorText>{error}</ErrorText> : null}

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={busy || problem !== null}
                style={({ pressed }) => [
                  styles.primary,
                  (busy || problem !== null) && styles.primaryOff,
                  pressed && styles.pressed
                ]}
                onPress={() => void record()}
              >
                <Text style={styles.primaryText}>{busy ? "Recording…" : "Record consent"}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.quiet, pressed && styles.pressed]}
                onPress={() => setOpen(false)}
              >
                <Text style={styles.quietText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.add, pressed && styles.pressed]}
            onPress={() => setOpen(true)}
          >
            <Ionicons name="add" size={15} color={palette.brandInk} />
            <Text style={styles.addText}>Record consent</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, paddingTop: space.sm },
  consent: {
    gap: 3,
    paddingLeft: space.md,
    borderLeftWidth: 2,
    borderLeftColor: palette.line
  },
  row: { flexDirection: "row", alignItems: "center", gap: 7 },
  who: { ...type.small, fontSize: 12.5, color: palette.ink, fontFamily: fonts.medium, flex: 1 },
  withdrawn: { color: palette.quiet },
  detail: { ...type.small, fontSize: 12, color: palette.quiet },
  withdrawnReason: { ...type.small, fontSize: 12, color: palette.red },
  missing: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: palette.amberSoft,
    borderRadius: radiusControl,
    paddingHorizontal: space.md,
    paddingVertical: space.sm
  },
  missingText: { ...type.small, fontSize: 12.5, color: palette.amber, flex: 1 },
  form: {
    gap: space.sm,
    padding: space.md,
    backgroundColor: palette.ground,
    borderRadius: radiusControl,
    borderWidth: hairline,
    borderColor: palette.line
  },
  withdrawForm: { gap: space.sm, paddingTop: space.sm },
  problem: { ...type.small, fontSize: 12, color: palette.amber },
  actions: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  primary: {
    flex: 1,
    minHeight: 44,
    borderRadius: radiusControl,
    backgroundColor: palette.brand,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryOff: { opacity: 0.45 },
  primaryText: { fontFamily: fonts.semibold, fontSize: 14, color: palette.surface },
  danger: {
    flex: 1,
    minHeight: 44,
    borderRadius: radiusControl,
    backgroundColor: palette.redSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  dangerText: { fontFamily: fonts.semibold, fontSize: 14, color: palette.red },
  quiet: { minHeight: 44, paddingHorizontal: space.md, justifyContent: "center" },
  quietText: { ...type.small, fontSize: 13, color: palette.quiet },
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radiusControl,
    borderWidth: hairline,
    borderColor: palette.line,
    alignSelf: "flex-start"
  },
  addText: { ...type.small, fontSize: 13, color: palette.brandInk, fontFamily: fonts.medium },
  pressed: { opacity: 0.75 }
});
