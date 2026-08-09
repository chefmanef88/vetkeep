import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { generatePatientCode } from "@vetkeep/domain";
import { definedArgs, optionalText } from "@vetkeep/contracts";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import { resolveDateOfBirth, type DobMode } from "@/features/practice/patient-dob";
import { Card, FieldLabel, ScrollScreen, Segmented } from "@/ui/practice-components";
import {
  Avatar,
  CodeChip,
  Collapsible,
  EmptyState,
  InfoRow,
  ListHeader,
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
    address: string | null;
  };
  patients: {
    id: string;
    name: string;
    species: string;
    breed: string | null;
    patient_code: string;
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

export default function ClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState("unknown");
  const [dobMode, setDobMode] = useState<DobMode>("unknown");
  const [dobText, setDobText] = useState("");
  const [ageYears, setAgeYears] = useState("");
  const [ageMonths, setAgeMonths] = useState("");
  const [colorMarkings, setColorMarkings] = useState("");
  const [microchipId, setMicrochipId] = useState("");
  const [identificationNotes, setIdentificationNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        .select("id, client_code, name, phone_display, address")
        .eq("id", clientId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("patient_owners")
        .select("id, patients(id, name, species, breed, patient_code)")
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
    setSpecies("");
    setBreed("");
    setSex("unknown");
    setDobMode("unknown");
    setDobText("");
    setAgeYears("");
    setAgeMonths("");
    setColorMarkings("");
    setMicrochipId("");
    setIdentificationNotes("");
  }

  async function addPatient() {
    setError(null);

    // Resolved before anything is sent, so a bad age is caught here rather than
    // after the animal is already half-created.
    const dob = resolveDateOfBirth({
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
        p_sex: sex,
        p_breed: optionalText(breed),
        // Omitted rather than sent as null when the age is unknown, so the
        // function's own default applies. definedArgs strips the key.
        p_date_of_birth: dob.date ?? undefined,
        p_date_of_birth_precision: dob.precision,
        p_color_markings: optionalText(colorMarkings),
        p_microchip_id: optionalText(microchipId),
        p_identification_notes: optionalText(identificationNotes)
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
      </Card>

      {data.patients.length > 0 ? (
        <ListHeader title="Animals" count={data.patients.length} />
      ) : null}

      {data.patients.length > 0 ? (
        <View style={styles.list}>
          {data.patients.map((patient) => (
            <PersonRow
              key={patient.id}
              name={patient.name}
              code={patient.patient_code}
              meta={`${patient.species}${patient.breed ? ` · ${patient.breed}` : ""}`}
              tone="good"
              onPress={() => router.push("/practice/today")}
            />
          ))}
        </View>
      ) : null}

      {data.patients.length === 0 ? (
        <EmptyState
          icon="paw-outline"
          title="No animals yet"
          hint="Add the first one below. Everything saves on the device first."
        />
      ) : null}

      <Collapsible title="Add an animal" icon="paw">
        <FieldLabel>Name</FieldLabel>
        <Field value={name} onChangeText={setName} placeholder="Called at home" />

        <FieldLabel>Species</FieldLabel>
        <Field value={species} onChangeText={setSpecies} placeholder="Dog" />

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

        <FieldLabel>Microchip number</FieldLabel>
        <Field
          value={microchipId}
          onChangeText={setMicrochipId}
          placeholder="Searchable later"
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
        />

        <FieldLabel>Other identifying marks</FieldLabel>
        <Field
          value={identificationNotes}
          onChangeText={setIdentificationNotes}
          placeholder="Scar, collar tag, torn ear"
        />

        {error ? <ErrorText>{error}</ErrorText> : null}
        <PrimaryButton
          label={busy ? "Saving…" : "Add animal"}
          disabled={busy || name.trim() === "" || species.trim() === ""}
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
