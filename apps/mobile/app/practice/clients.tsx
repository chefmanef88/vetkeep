import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { generateClientCode } from "@vetkeep/domain";
import { definedArgs, optionalText } from "@vetkeep/contracts";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import { ScrollScreen, FieldLabel } from "@/ui/practice-components";
import { Collapsible, EmptyState, ListHeader, PersonRow, SearchField } from "@/ui/elements";
import { ErrorText, Field, PrimaryButton } from "@/ui/components";
import { palette, space, type } from "@/ui/tokens";

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
  const [consent, setConsent] = useState(false);
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
  const all = data ?? [];
  const visible = all.filter(
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
        p_address: optionalText(address),
        p_communication_consent: consent
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
    setConsent(false);
    reload();
  }

  return (
    <ScrollScreen>
      <SearchField value={search} onChangeText={setSearch} placeholder="Name, code or phone" />

      <Collapsible title="Add a client" icon="person-add">
        <FieldLabel>Name</FieldLabel>
        <Field value={name} onChangeText={setName} placeholder="Full name" />
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
        <Field value={address} onChangeText={setAddress} placeholder="Optional" />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consent }}
          style={styles.consentRow}
          onPress={() => setConsent(!consent)}
        >
          <Ionicons
            name={consent ? "checkbox" : "square-outline"}
            size={20}
            color={consent ? palette.brandInk : palette.quiet}
          />
          <Text style={styles.consentText}>
            This client agreed to receive vaccination and follow-up reminders.
          </Text>
        </Pressable>

        {error ? <ErrorText>{error}</ErrorText> : null}
        <PrimaryButton
          label={busy ? "Saving…" : "Add client"}
          disabled={busy || name.trim() === "" || phoneDisplay.trim() === ""}
          onPress={() => void addClient()}
        />
      </Collapsible>

      {loading ? <ActivityIndicator /> : null}
      {loadError ? <ErrorText>{loadError}</ErrorText> : null}

      {!loading && all.length > 0 ? (
        <ListHeader title={term === "" ? "All clients" : "Matches"} count={visible.length} />
      ) : null}

      {/* One surface for the whole list, so the rows read as a continuous
          column rather than a stack of separate boxes. */}
      {visible.length > 0 ? (
        <View style={{ borderRadius: 16, overflow: "hidden" }}>
          {visible.map((client) => (
            <PersonRow
              key={client.id}
              name={client.name}
              code={client.client_code}
              meta={client.phone_display}
              onPress={() => router.push(`/practice/client/${client.id}`)}
            />
          ))}
        </View>
      ) : null}

      {!loading && all.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No clients yet"
          hint="Add the first one above. It saves on the device and syncs when you have signal."
        />
      ) : null}

      {!loading && all.length > 0 && visible.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title="Nobody matches that"
          hint={`No result for “${search}”.`}
        />
      ) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    paddingVertical: space.sm
  },
  consentText: { ...type.small, fontSize: 12, color: palette.ink, flex: 1, lineHeight: 17 }
});
