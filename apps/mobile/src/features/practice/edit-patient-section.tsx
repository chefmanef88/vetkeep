import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SPECIES, speciesProfile } from "@vetkeep/domain";
import { definedArgs, optionalNumber, optionalText } from "@vetkeep/contracts";
import { supabase } from "@/lib/supabase";
import { FieldLabel, Segmented } from "@/ui/practice-components";
import { OptionChips } from "@/ui/elements";
import { ErrorText, Field, PrimaryButton } from "@/ui/components";
import { fonts, hairline, palette, space, type } from "@/ui/tokens";

/**
 * Correcting an animal's standing details, on the phone.
 *
 * update_patient has existed since Phase 2 and was wired to nothing. A microchip
 * number typed wrong, a date of birth learned later from the owner, markings
 * that turn out to describe a different dog — none of it could be fixed.
 *
 * Two fields are deliberately absent. Kind and purpose are not edited here: an
 * individual that becomes a group, or a pet that becomes a food animal, changes
 * which clinical rules apply to every record already in the folder, including
 * the withholding obligations on treatments already given.
 */

const SEXES = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "female_spayed", label: "Spayed" },
  { value: "male_neutered", label: "Neutered" },
  { value: "unknown", label: "Unknown" }
];

const PRECISIONS = [
  { value: "exact", label: "Exact" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "estimated", label: "Estimated" }
];

export type EditablePatient = {
  id: string;
  name: string;
  species: string;
  kind: string;
  purpose: string;
  sex: string | null;
  breed: string | null;
  date_of_birth: string | null;
  date_of_birth_precision: string | null;
  color_markings: string | null;
  microchip_id: string | null;
  ear_tag: string | null;
  head_count: number | null;
  status: string;
  server_version: number;
};

export function EditPatientSection({
  patient,
  onSaved
}: {
  patient: EditablePatient;
  onSaved: () => void;
}) {
  const isGroup = patient.kind === "group";

  const [name, setName] = useState(patient.name);
  const [species, setSpecies] = useState(patient.species);
  const [sex, setSex] = useState(patient.sex ?? "unknown");
  const [breed, setBreed] = useState(patient.breed ?? "");
  const [dob, setDob] = useState(patient.date_of_birth ?? "");
  const [precision, setPrecision] = useState(patient.date_of_birth_precision ?? "exact");
  const [markings, setMarkings] = useState(patient.color_markings ?? "");
  const [microchip, setMicrochip] = useState(patient.microchip_id ?? "");
  const [earTag, setEarTag] = useState(patient.ear_tag ?? "");
  const [headCount, setHeadCount] = useState(
    patient.head_count === null ? "" : String(patient.head_count)
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setError(null);
    setSaved(false);
    setBusy(true);

    const { error: rpcError } = await supabase.rpc(
      "update_patient",
      definedArgs({
        p_id: patient.id,
        p_name: name,
        p_species: species,
        p_kind: patient.kind,
        p_purpose: patient.purpose,
        p_sex: isGroup ? undefined : sex,
        p_breed: optionalText(breed),
        p_date_of_birth: optionalText(dob),
        p_date_of_birth_precision: optionalText(precision),
        p_color_markings: optionalText(markings),
        p_microchip_id: optionalText(microchip),
        p_ear_tag: optionalText(earTag),
        p_head_count: isGroup ? optionalNumber(headCount) : undefined,
        p_status: patient.status,
        p_base_server_version: patient.server_version
      })
    );

    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setSaved(true);
    onSaved();
  }

  // Rendered inside the details card rather than as a block of its own: this
  // is one more line of that card, and the control sits at the end of it.
  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit these details"
        style={styles.editRow}
        onPress={() => setOpen(true)}
      >
        <Ionicons name="create-outline" size={15} color={palette.brandInk} />
        <Text style={styles.editText}>Edit</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.editing}>
      <FieldLabel>Name</FieldLabel>
      <Field value={name} onChangeText={setName} />

      <FieldLabel>Species</FieldLabel>
      <OptionChips
        options={SPECIES.map((value) => ({ value, label: speciesProfile(value).label }))}
        value={species}
        onChange={setSpecies}
        accessibilityLabel="Species"
      />

      <FieldLabel>Breed</FieldLabel>
      <Field value={breed} onChangeText={setBreed} placeholder="Boerboel" />

      {isGroup ? (
        <>
          <FieldLabel>Head count</FieldLabel>
          <Field value={headCount} onChangeText={setHeadCount} keyboardType="number-pad" />
        </>
      ) : (
        <>
          <FieldLabel>Sex</FieldLabel>
          <Segmented options={SEXES} value={sex} onChange={setSex} accessibilityLabel="Sex" />
        </>
      )}

      <FieldLabel>Date of birth</FieldLabel>
      <Field value={dob} onChangeText={setDob} placeholder="2024-03-15" autoCapitalize="none" />

      <FieldLabel>How exact is that?</FieldLabel>
      <Segmented
        options={PRECISIONS}
        value={precision}
        onChange={setPrecision}
        accessibilityLabel="Date of birth precision"
      />

      <FieldLabel>Colour and markings</FieldLabel>
      <Field
        value={markings}
        onChangeText={setMarkings}
        placeholder="Brindle, white chest, torn left ear"
        multiline
        numberOfLines={2}
      />

      <FieldLabel>Microchip number</FieldLabel>
      <Field
        value={microchip}
        onChangeText={setMicrochip}
        placeholder="900123456789012"
        autoCapitalize="none"
      />

      <FieldLabel>Ear tag</FieldLabel>
      <Field value={earTag} onChangeText={setEarTag} autoCapitalize="characters" />

      {error ? <ErrorText>{error}</ErrorText> : null}
      {saved ? <Text style={styles.saved}>Saved.</Text> : null}

      <PrimaryButton
        label={busy ? "Saving…" : "Save changes"}
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
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 5,
    paddingTop: space.sm
  },
  editText: { ...type.small, fontSize: 13, color: palette.brandInk, fontFamily: fonts.semibold },
  editing: {
    gap: space.xs,
    borderTopWidth: hairline,
    borderTopColor: palette.line,
    paddingTop: space.md
  },
  cancel: {
    ...type.small,
    fontSize: 12,
    color: palette.quiet,
    textAlign: "center",
    paddingTop: space.sm
  },
  saved: { ...type.small, fontSize: 12, color: palette.green }
});
