import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator } from "react-native";
import { generatePatientCode } from "@vetkeep/domain";
import { definedArgs, optionalText } from "@vetkeep/contracts";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import {
  Card,
  FieldLabel,
  Muted,
  RowButton,
  ScrollScreen,
  SectionTitle,
  Segmented
} from "@/ui/practice-components";
import { ErrorText, Field, PrimaryButton } from "@/ui/components";

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

export default function ClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState("unknown");
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

  async function addPatient() {
    setBusy(true);
    setError(null);
    const patientId = globalThis.crypto.randomUUID();

    const { error: patientError } = await supabase.rpc(
      "create_patient",
      definedArgs({
        p_id: patientId,
        p_patient_code: generatePatientCode(),
        p_name: name,
        p_species: species,
        p_sex: sex,
        p_breed: optionalText(breed)
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

    setName("");
    setSpecies("");
    setBreed("");
    setSex("unknown");
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

  return (
    <ScrollScreen>
      <Card>
        <SectionTitle>{data.client.name}</SectionTitle>
        <Muted>
          {data.client.client_code} · {data.client.phone_display}
        </Muted>
        {data.client.address ? <Muted>{data.client.address}</Muted> : null}
      </Card>

      <Card>
        <SectionTitle>Animals</SectionTitle>
        {data.patients.length === 0 ? <Muted>No animals recorded yet.</Muted> : null}
        {data.patients.map((patient) => (
          <RowButton
            key={patient.id}
            title={patient.name}
            subtitle={`${patient.species}${patient.breed ? ` · ${patient.breed}` : ""} · ${patient.patient_code}`}
            onPress={() => router.push("/practice/today")}
          />
        ))}
      </Card>

      <Card>
        <SectionTitle>Add an animal</SectionTitle>
        <FieldLabel>Name</FieldLabel>
        <Field value={name} onChangeText={setName} />
        <FieldLabel>Species</FieldLabel>
        <Field value={species} onChangeText={setSpecies} placeholder="Dog" />
        <FieldLabel>Breed</FieldLabel>
        <Field value={breed} onChangeText={setBreed} />
        <FieldLabel>Sex</FieldLabel>
        <Segmented options={SEXES} value={sex} onChange={setSex} accessibilityLabel="Sex" />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <PrimaryButton
          label={busy ? "Saving…" : "Add animal"}
          disabled={busy}
          onPress={() => void addPatient()}
        />
      </Card>
    </ScrollScreen>
  );
}
