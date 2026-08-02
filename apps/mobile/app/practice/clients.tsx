import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator } from "react-native";
import { generateClientCode } from "@vetkeep/domain";
import { definedArgs, optionalText } from "@vetkeep/contracts";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import {
  Card,
  Muted,
  RowButton,
  ScrollScreen,
  SectionTitle,
  FieldLabel
} from "@/ui/practice-components";
import { ErrorText, Field, PrimaryButton } from "@/ui/components";

type ClientRow = {
  id: string;
  client_code: string;
  name: string;
  phone_display: string;
  address: string | null;
};

export default function ClientsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const {
    data,
    error: loadError,
    loading,
    reload
  } = useQuery<ClientRow[]>(async () => {
    const { data: rows, error: queryError } = await supabase
      .from("clients")
      .select("id, client_code, name, phone_display, address")
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (queryError) throw new Error("Could not load clients.");
    return (rows ?? []) as ClientRow[];
  }, []);

  const term = search.trim().toLowerCase();
  const visible = (data ?? []).filter(
    (client) =>
      term === "" ||
      client.name.toLowerCase().includes(term) ||
      client.client_code.toLowerCase().includes(term) ||
      client.phone_display.replace(/\s/g, "").includes(term.replace(/\s/g, ""))
  );

  async function addClient() {
    setBusy(true);
    setError(null);
    // Id and code are minted on the device, so this works with no signal and a
    // retried sync cannot create the client twice.
    const { error: rpcError } = await supabase.rpc(
      "create_client",
      definedArgs({
        p_id: globalThis.crypto.randomUUID(),
        p_client_code: generateClientCode(),
        p_name: name,
        p_phone_display: phoneDisplay,
        p_phone_e164: phoneE164,
        p_address: optionalText(address)
      })
    );
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setName("");
    setPhoneDisplay("");
    setPhoneE164("");
    setAddress("");
    reload();
  }

  return (
    <ScrollScreen>
      <Card>
        <SectionTitle>Find a client</SectionTitle>
        <Field
          value={search}
          onChangeText={setSearch}
          placeholder="Name, code or phone"
          autoCapitalize="none"
        />
        {loading ? <ActivityIndicator /> : null}
        {loadError ? <ErrorText>{loadError}</ErrorText> : null}
        {!loading && visible.length === 0 ? <Muted>Nobody matches that.</Muted> : null}
        {visible.map((client) => (
          <RowButton
            key={client.id}
            title={client.name}
            subtitle={`${client.client_code} · ${client.phone_display}`}
            onPress={() => router.push(`/practice/client/${client.id}`)}
          />
        ))}
      </Card>

      <Card>
        <SectionTitle>Add a client</SectionTitle>
        <FieldLabel>Name</FieldLabel>
        <Field value={name} onChangeText={setName} />
        <FieldLabel>Phone as displayed</FieldLabel>
        <Field value={phoneDisplay} onChangeText={setPhoneDisplay} placeholder="024 123 4567" />
        <FieldLabel>Phone in E.164</FieldLabel>
        <Field
          value={phoneE164}
          onChangeText={setPhoneE164}
          placeholder="+233241234567"
          keyboardType="phone-pad"
        />
        <FieldLabel>Address or landmark</FieldLabel>
        <Field value={address} onChangeText={setAddress} />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <PrimaryButton
          label={busy ? "Saving…" : "Add client"}
          disabled={busy}
          onPress={() => void addClient()}
        />
      </Card>
    </ScrollScreen>
  );
}
