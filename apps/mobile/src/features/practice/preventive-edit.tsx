import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PARASITE_TARGETS, parasiteLabel } from "@vetkeep/domain";
import { definedArgs, optionalText } from "@vetkeep/contracts";
import { supabase } from "@/lib/supabase";
import { FieldLabel } from "@/ui/practice-components";
import { ErrorText, Field, PrimaryButton } from "@/ui/components";
import { fonts, hairline, palette, radiusControl, radiusPill, space, type } from "@/ui/tokens";

/**
 * Correcting one preventive care entry in place.
 *
 * The alternative was delete and re-record, which loses the original entry and
 * writes a deletion into the audit trail for what was a typing mistake. The
 * fields offered are the ones that actually get mistyped: the product, the
 * date, the batch number and the next due date.
 *
 * The kind is not offered. A vaccination that should have been a worming is a
 * wrong entry rather than a mistyped one, and the server refuses to change it.
 */

export type EditableEntry = {
  id: string;
  kind: string;
  vaccine_type: string | null;
  product_name: string;
  batch_lot_number: string | null;
  dose: string | null;
  date_given: string;
  next_due_date: string | null;
  target_parasites: string[] | null;
  server_version: number;
  /** Set once the consultation it belongs to has been signed. */
  locked: boolean;
};

export function PreventiveEdit({ entry, onSaved }: { entry: EditableEntry; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [productName, setProductName] = useState(entry.product_name);
  const [dateGiven, setDateGiven] = useState(entry.date_given);
  const [batch, setBatch] = useState(entry.batch_lot_number ?? "");
  const [dose, setDose] = useState(entry.dose ?? "");
  const [nextDue, setNextDue] = useState(entry.next_due_date ?? "");
  const [parasites, setParasites] = useState<string[]>(entry.target_parasites ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isParasiteControl = entry.kind === "ectoparasite_control";

  if (entry.locked) {
    return (
      <Text style={styles.lockedNote}>
        Signed with its consultation. Correcting it now is an amendment to the record.
      </Text>
    );
  }

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Correct ${entry.product_name}`}
        style={styles.correctRow}
        onPress={() => setOpen(true)}
      >
        <Ionicons name="create-outline" size={14} color={palette.quiet} />
        <Text style={styles.correctText}>Correct this</Text>
      </Pressable>
    );
  }

  async function save() {
    setError(null);
    setBusy(true);

    const { error: rpcError } = await supabase.rpc(
      "update_preventive_care",
      definedArgs({
        p_id: entry.id,
        p_product_name: productName,
        p_date_given: dateGiven,
        // Carried through unchanged: the server requires it for a vaccination
        // and refuses it for anything else.
        p_vaccine_type: entry.vaccine_type ?? undefined,
        p_batch_lot_number: optionalText(batch),
        p_dose: optionalText(dose),
        p_next_due_date: optionalText(nextDue),
        p_target_parasites: isParasiteControl && parasites.length > 0 ? parasites : undefined,
        p_base_server_version: entry.server_version
      })
    );

    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setOpen(false);
    onSaved();
  }

  return (
    <View style={styles.editBox}>
      <FieldLabel>Product</FieldLabel>
      <Field value={productName} onChangeText={setProductName} />

      <FieldLabel>Date given</FieldLabel>
      <Field value={dateGiven} onChangeText={setDateGiven} autoCapitalize="none" />

      <FieldLabel>Batch or serial number</FieldLabel>
      <Field value={batch} onChangeText={setBatch} autoCapitalize="characters" />

      <FieldLabel>Dose given</FieldLabel>
      <Field value={dose} onChangeText={setDose} />

      <FieldLabel>Next due</FieldLabel>
      <Field value={nextDue} onChangeText={setNextDue} autoCapitalize="none" />

      {isParasiteControl ? (
        <>
          <FieldLabel>What is being treated</FieldLabel>
          <View style={styles.parasiteRow}>
            {PARASITE_TARGETS.map((target) => {
              const picked = parasites.includes(target);
              return (
                <Pressable
                  key={target}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: picked }}
                  accessibilityLabel={parasiteLabel(target)}
                  style={[styles.chip, picked && styles.chipOn]}
                  onPress={() =>
                    setParasites((current) =>
                      current.includes(target)
                        ? current.filter((one) => one !== target)
                        : [...current, target]
                    )
                  }
                >
                  <Text style={[styles.chipText, picked && styles.chipTextOn]}>
                    {parasiteLabel(target)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {error ? <ErrorText>{error}</ErrorText> : null}

      <PrimaryButton
        label={busy ? "Saving…" : "Save the correction"}
        disabled={busy}
        onPress={() => void save()}
      />
      <Pressable accessibilityRole="button" onPress={() => setOpen(false)} disabled={busy}>
        <Text style={styles.cancel}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  correctRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingTop: space.xs },
  correctText: { ...type.small, fontSize: 11, color: palette.quiet },
  lockedNote: { ...type.small, fontSize: 11, color: palette.quiet, paddingTop: space.xs },
  editBox: {
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radiusControl,
    borderWidth: hairline,
    borderColor: palette.line,
    backgroundColor: palette.ground,
    gap: space.xs
  },
  parasiteRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radiusPill,
    borderWidth: hairline,
    borderColor: palette.line,
    backgroundColor: palette.surface
  },
  chipOn: { backgroundColor: palette.brandSoft, borderColor: palette.brand },
  chipText: { ...type.small, fontSize: 12, color: palette.quiet },
  chipTextOn: { color: palette.brandInk, fontFamily: fonts.semibold },
  cancel: {
    ...type.small,
    fontSize: 12,
    color: palette.quiet,
    textAlign: "center",
    paddingTop: space.sm
  }
});
