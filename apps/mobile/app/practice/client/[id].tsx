import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import {
  PURPOSES,
  allowsGroup,
  generatePatientCode,
  purposeLabel,
  speciesProfile,
  SPECIES,
  type PatientKind,
  type Purpose,
  type Species
} from "@vetkeep/domain";
import { definedArgs, optionalNumber, optionalText } from "@vetkeep/contracts";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import { EditClientSection, type EditableClient } from "@/features/practice/edit-client-section";
import { resolveDateOfBirth, type DobMode } from "@/features/practice/patient-dob";
import { Card, FieldLabel, Muted, ScrollScreen, Segmented } from "@/ui/practice-components";
import {
  Avatar,
  CodeChip,
  Collapsible,
  EmptyState,
  InfoRow,
  ListHeader,
  OptionChips,
  PersonRow
} from "@/ui/elements";
import { ErrorText, Field, PrimaryButton } from "@/ui/components";
import { fonts, palette, radius, space, type } from "@/ui/tokens";

type Loaded = {
  client: {
    id: string;
    client_code: string;
    name: string;
    phone_display: string;
    phone_e164: string;
    whatsapp_display: string | null;
    whatsapp_e164: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    communication_consent: boolean;
    server_version: number;
  };
  patients: {
    id: string;
    name: string;
    species: string;
    breed: string | null;
    patient_code: string;
    kind: string;
    purpose: string;
    head_count: number | null;
  }[];
};

const SEXES = [
  { value: "female", label: "F" },
  { value: "female_spayed", label: "F/S" },
  { value: "male", label: "M" },
  { value: "male_neutered", label: "M/N" },
  { value: "unknown", label: "?" }
];

const DOB_MODES: { value: DobMode; label: string }[] = [
  { value: "exact", label: "Exact date" },
  { value: "estimated", label: "About" },
  { value: "unknown", label: "Unknown" }
];

const SPECIES_OPTIONS = SPECIES.map((value) => ({
  value,
  label: speciesProfile(value).label
}));

/** What a folder is, in one line: "Flock of 400 · eggs" or "Dog · pet". */
function describeFolder(patient: Loaded["patients"][number]): string {
  const profile = speciesProfile(patient.species);
  if (patient.kind === "group") {
    const noun = profile.groupNoun ?? "group";
    const head = patient.head_count === null ? "" : ` of ${patient.head_count}`;
    return `${noun.charAt(0).toUpperCase()}${noun.slice(1)}${head} · ${purposeLabel(patient.purpose)}`;
  }
  return `${profile.label}${patient.breed ? ` · ${patient.breed}` : ""}`;
}

export default function ClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [name, setName] = useState("");
  const [species, setSpecies] = useState<Species>("dog");
  const [kind, setKind] = useState<PatientKind>("individual");
  const [purpose, setPurpose] = useState<Purpose>("pet");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState("unknown");
  const [dobMode, setDobMode] = useState<DobMode>("unknown");
  const [dobText, setDobText] = useState("");
  const [ageYears, setAgeYears] = useState("");
  const [ageMonths, setAgeMonths] = useState("");
  const [colorMarkings, setColorMarkings] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [identificationNotes, setIdentificationNotes] = useState("");
  const [headCount, setHeadCount] = useState("");
  const [groupAgeWeeks, setGroupAgeWeeks] = useState("");
  const [housing, setHousing] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const profile = speciesProfile(species);
  const isGroup = kind === "group";

  /**
   * Changing species can invalidate the other two choices: a dog cannot be a
   * flock, and a cat cannot be kept for milk. Both are corrected here rather
   * than left to be rejected by the database after the vet has filled the form.
   */
  function chooseSpecies(next: Species) {
    setSpecies(next);
    const nextProfile = speciesProfile(next);
    if (!nextProfile.kinds.includes(kind)) setKind("individual");
    if (!nextProfile.purposes.includes(purpose)) setPurpose(nextProfile.purposes[0] ?? "pet");
  }

  const {
    data,
    error: loadError,
    loading,
    reload
  } = useQuery<Loaded>(async () => {
    const clientId = String(id);
    const [clientResult, ownerResult] = await Promise.all([
      supabase
        .from("clients")
        .select(
          "id, client_code, name, phone_display, phone_e164, whatsapp_display, whatsapp_e164, email, address, notes, communication_consent, server_version"
        )
        .eq("id", clientId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("patient_owners")
        .select("id, patients(id, name, species, breed, patient_code, kind, purpose, head_count)")
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .is("valid_to", null)
    ]);

    if (clientResult.error || !clientResult.data) throw new Error("Could not load this client.");

    const patients = (ownerResult.data ?? [])
      .map((row) => row.patients)
      .filter((patient): patient is NonNullable<typeof patient> => patient !== null);

    return { client: clientResult.data, patients };
  }, [id]);

  function resetForm() {
    setName("");
    setSpecies("dog");
    setKind("individual");
    setPurpose("pet");
    setBreed("");
    setSex("unknown");
    setDobMode("unknown");
    setDobText("");
    setAgeYears("");
    setAgeMonths("");
    setColorMarkings("");
    setIdentifier("");
    setIdentificationNotes("");
    setHeadCount("");
    setGroupAgeWeeks("");
    setHousing("");
  }

  async function addPatient() {
    setError(null);

    if (isGroup && optionalNumber(headCount) === undefined) {
      setError(`How many animals are in this ${profile.groupNoun ?? "group"}?`);
      return;
    }

    // Resolved before anything is sent, so a bad age is caught here rather than
    // after the animal is already half-created. Groups carry an age in weeks
    // instead, so the question is not asked of them.
    const dob = isGroup
      ? ({ ok: true, date: null, precision: "unknown" } as const)
      : resolveDateOfBirth({
          mode: dobMode,
          exactText: dobText,
          years: ageYears,
          months: ageMonths
        });
    if (!dob.ok) {
      setError(dob.message);
      return;
    }

    setBusy(true);
    const patientId = globalThis.crypto.randomUUID();

    const { error: patientError } = await supabase.rpc(
      "create_patient",
      definedArgs({
        p_id: patientId,
        p_patient_code: generatePatientCode(),
        p_name: name,
        p_species: species,
        p_kind: kind,
        p_purpose: purpose,
        // A group carries no single sex, and the database rejects one.
        p_sex: isGroup ? undefined : sex,
        p_breed: optionalText(breed),
        p_date_of_birth: dob.date ?? undefined,
        p_date_of_birth_precision: dob.precision,
        p_color_markings: optionalText(colorMarkings),
        p_microchip_id: profile.identifier === "microchip" ? optionalText(identifier) : undefined,
        p_ear_tag: profile.identifier === "ear_tag" ? optionalText(identifier) : undefined,
        p_leg_ring: profile.identifier === "leg_ring" ? optionalText(identifier) : undefined,
        p_identification_notes: optionalText(identificationNotes),
        p_head_count: isGroup ? optionalNumber(headCount) : undefined,
        p_group_age_weeks: isGroup ? optionalNumber(groupAgeWeeks) : undefined,
        p_housing: isGroup ? optionalText(housing) : undefined
      })
    );
    if (patientError) {
      setBusy(false);
      setError(patientError.message);
      return;
    }

    const { error: ownerError } = await supabase.rpc("create_patient_owner", {
      p_id: globalThis.crypto.randomUUID(),
      p_patient_id: patientId,
      p_client_id: String(id),
      p_is_primary: true
    });
    setBusy(false);
    if (ownerError) {
      // The animal exists but is unowned. Say which half succeeded rather than
      // implying nothing was saved.
      setError(`Saved the animal, but could not link it to this client: ${ownerError.message}`);
      reload();
      return;
    }

    resetForm();
    reload();
  }

  if (loading && !data) {
    return (
      <ScrollScreen>
        <ActivityIndicator />
      </ScrollScreen>
    );
  }
  if (loadError || !data) {
    return (
      <ScrollScreen>
        <Card>
          <ErrorText>{loadError ?? "This client is unavailable."}</ErrorText>
        </Card>
      </ScrollScreen>
    );
  }

  const phone = data.client.phone_display;
  const identifierLabel =
    profile.identifier === "microchip"
      ? "Microchip number"
      : profile.identifier === "ear_tag"
        ? "Ear tag"
        : profile.identifier === "leg_ring"
          ? "Leg ring"
          : null;

  return (
    <ScrollScreen>
      <View style={styles.header}>
        <Avatar name={data.client.name} />
        <View style={styles.headerBody}>
          <Text style={styles.headerName}>{data.client.name}</Text>
          <CodeChip>{data.client.client_code}</CodeChip>
        </View>
      </View>

      <Card>
        {/* Both are reachable in one tap. On a doorstep the phone number and the
            address are the two things a vet needs to act on, not just read. */}
        <InfoRow
          icon="call-outline"
          label="Phone"
          value={phone}
          tone="brand"
          onPress={() => void Linking.openURL(`tel:${phone.replace(/\s/g, "")}`)}
        />
        {data.client.address ? (
          <InfoRow
            icon="location-outline"
            label="Address"
            value={data.client.address}
            tone="brand"
            onPress={() =>
              void Linking.openURL(`geo:0,0?q=${encodeURIComponent(data.client.address ?? "")}`)
            }
          />
        ) : null}

        {/* The last line of this card, not a block of its own. */}
        <EditClientSection client={data.client as EditableClient} onSaved={reload} />
      </Card>

      {data.patients.length > 0 ? (
        <ListHeader title="Folders" count={data.patients.length} />
      ) : null}

      {data.patients.length > 0 ? (
        <View style={styles.list}>
          {data.patients.map((patient) => (
            <PersonRow
              key={patient.id}
              name={patient.name}
              code={patient.patient_code}
              meta={describeFolder(patient)}
              tone={patient.kind === "group" ? "warn" : "good"}
              onPress={() =>
                router.push({ pathname: "/practice/patient/[id]", params: { id: patient.id } })
              }
            />
          ))}
        </View>
      ) : null}

      {data.patients.length === 0 ? (
        <EmptyState
          icon="folder-open-outline"
          title="No folders yet"
          hint="Add an animal or a flock below. Everything saves on the device first."
        />
      ) : null}

      <Collapsible title="Add an animal or group" icon="add-circle">
        <FieldLabel>Species</FieldLabel>
        <OptionChips
          options={SPECIES_OPTIONS}
          value={species}
          onChange={chooseSpecies}
          accessibilityLabel="Species"
        />

        {allowsGroup(species) ? (
          <>
            <FieldLabel>One animal or a {profile.groupNoun ?? "group"}</FieldLabel>
            <Segmented
              options={[
                { value: "individual", label: "One animal" },
                {
                  value: "group",
                  label: (profile.groupNoun ?? "group").replace(/^./, (c) => c.toUpperCase())
                }
              ]}
              value={kind}
              onChange={(next) => setKind(next as PatientKind)}
              accessibilityLabel="Individual or group"
            />
          </>
        ) : null}

        <FieldLabel>Kept for</FieldLabel>
        <OptionChips
          options={PURPOSES.filter((p) => profile.purposes.includes(p)).map((value) => ({
            value,
            label: purposeLabel(value)
          }))}
          value={purpose}
          onChange={setPurpose}
          accessibilityLabel="Purpose"
        />
        {/* Stated plainly, because this is the choice that decides whether a
            treatment will demand withholding dates later. */}
        {purpose !== "pet" && profile.withdrawals.length > 0 ? (
          <Muted>
            Treatments on this folder will require {profile.withdrawals.join(" and ")} withholding
            periods.
          </Muted>
        ) : null}

        <FieldLabel>{isGroup ? "Name of the group" : "Name"}</FieldLabel>
        <Field
          value={name}
          onChangeText={setName}
          placeholder={isGroup ? "Layer house 2" : "Called at home"}
        />

        {isGroup ? (
          <>
            <FieldLabel>How many animals</FieldLabel>
            <Field
              value={headCount}
              onChangeText={setHeadCount}
              placeholder="400"
              keyboardType="number-pad"
            />
            <FieldLabel>Age in weeks</FieldLabel>
            <Field
              value={groupAgeWeeks}
              onChangeText={setGroupAgeWeeks}
              placeholder="32"
              keyboardType="number-pad"
            />
            <FieldLabel>Housing</FieldLabel>
            <Field
              value={housing}
              onChangeText={setHousing}
              placeholder="Deep litter, open sided"
            />
          </>
        ) : (
          <>
            <FieldLabel>Breed</FieldLabel>
            <Field value={breed} onChangeText={setBreed} placeholder="Optional" />

            <FieldLabel>Sex</FieldLabel>
            <Segmented options={SEXES} value={sex} onChange={setSex} accessibilityLabel="Sex" />

            <FieldLabel>Age</FieldLabel>
            <Segmented
              options={DOB_MODES}
              value={dobMode}
              onChange={setDobMode}
              accessibilityLabel="How the age is known"
            />
            {dobMode === "exact" ? (
              <Field
                value={dobText}
                onChangeText={setDobText}
                placeholder="2023-04-17"
                autoCapitalize="none"
              />
            ) : null}
            {dobMode === "estimated" ? (
              <View style={styles.ageRow}>
                <View style={styles.ageField}>
                  <Field
                    value={ageYears}
                    onChangeText={setAgeYears}
                    placeholder="0"
                    keyboardType="number-pad"
                  />
                  <Text style={styles.ageUnit}>years</Text>
                </View>
                <View style={styles.ageField}>
                  <Field
                    value={ageMonths}
                    onChangeText={setAgeMonths}
                    placeholder="0"
                    keyboardType="number-pad"
                  />
                  <Text style={styles.ageUnit}>months</Text>
                </View>
              </View>
            ) : null}

            <FieldLabel>Colour and markings</FieldLabel>
            <Field
              value={colorMarkings}
              onChangeText={setColorMarkings}
              placeholder="Tan, white blaze on chest"
            />
          </>
        )}

        {identifierLabel && !isGroup ? (
          <>
            <FieldLabel>{identifierLabel}</FieldLabel>
            <Field
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="Searchable later"
              autoCapitalize="characters"
            />
          </>
        ) : null}

        <FieldLabel>Other identifying marks</FieldLabel>
        <Field
          value={identificationNotes}
          onChangeText={setIdentificationNotes}
          placeholder={isGroup ? "House number, batch" : "Scar, collar tag, torn ear"}
        />

        {error ? <ErrorText>{error}</ErrorText> : null}
        <PrimaryButton
          label={busy ? "Saving…" : isGroup ? "Add group" : "Add animal"}
          disabled={busy || name.trim() === ""}
          onPress={() => void addPatient()}
        />
      </Collapsible>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.xs
  },
  headerBody: { flex: 1, gap: space.xs, alignItems: "flex-start" },
  headerName: { ...type.heading, fontSize: 24, color: palette.ink },
  list: { borderRadius: radius, overflow: "hidden" },
  ageRow: { flexDirection: "row", gap: space.md },
  ageField: { flex: 1, gap: space.xs },
  ageUnit: { fontFamily: fonts.regular, fontSize: 12, color: palette.quiet, paddingLeft: space.xs }
});
