import { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { definedArgs, optionalText } from "@vetkeep/contracts";
import { supabase } from "@/lib/supabase";
import { FieldLabel, Muted } from "@/ui/practice-components";
import { Collapsible } from "@/ui/elements";
import { ErrorText, Field, PrimaryButton } from "@/ui/components";
import { palette, type } from "@/ui/tokens";

/**
 * Correcting a client's details, on the phone.
 *
 * update_client has existed since Phase 2 and was wired to nothing, so a
 * mistyped number could be created and never fixed. That is the one field on a
 * client record that has to be right: a client who cannot be reached is a visit
 * that does not happen, and the vet finds out on the doorstep.
 *
 * Standing information stays editable for the life of the folder (brief §6).
 * Only the consultation record freezes, and that is a different table.
 */

export type EditableClient = {
  id: string;
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

export function EditClientSection({
  client,
  onSaved
}: {
  client: EditableClient;
  onSaved: () => void;
}) {
  const [name, setName] = useState(client.name);
  const [phoneDisplay, setPhoneDisplay] = useState(client.phone_display);
  const [phoneE164, setPhoneE164] = useState(client.phone_e164);
  const [whatsappDisplay, setWhatsappDisplay] = useState(client.whatsapp_display ?? "");
  const [whatsappE164, setWhatsappE164] = useState(client.whatsapp_e164 ?? "");
  const [email, setEmail] = useState(client.email ?? "");
  const [address, setAddress] = useState(client.address ?? "");
  const [notes, setNotes] = useState(client.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setError(null);
    setSaved(false);
    setBusy(true);

    const { error: rpcError } = await supabase.rpc(
      "update_client",
      definedArgs({
        p_id: client.id,
        p_name: name,
        p_phone_display: phoneDisplay,
        p_phone_e164: phoneE164,
        p_whatsapp_display: optionalText(whatsappDisplay),
        p_whatsapp_e164: optionalText(whatsappE164),
        p_email: optionalText(email),
        p_address: optionalText(address),
        p_notes: optionalText(notes),
        p_communication_consent: client.communication_consent,
        // The version this form was built from. A stale write is refused rather
        // than applied over a correction made on another device.
        p_base_server_version: client.server_version
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

  return (
    <Collapsible title="Correct these details" icon="create">
      <Muted>
        Names, numbers and addresses stay editable. It is the signed consultation record that never
        changes.
      </Muted>

      <FieldLabel>Name</FieldLabel>
      <Field value={name} onChangeText={setName} placeholder="Kwame Boateng" />

      <FieldLabel>Phone</FieldLabel>
      <Field value={phoneDisplay} onChangeText={setPhoneDisplay} keyboardType="phone-pad" />

      <FieldLabel>Phone in full international form</FieldLabel>
      <Field
        value={phoneE164}
        onChangeText={setPhoneE164}
        placeholder="+233…"
        autoCapitalize="none"
      />

      <FieldLabel>WhatsApp</FieldLabel>
      <Field value={whatsappDisplay} onChangeText={setWhatsappDisplay} keyboardType="phone-pad" />

      <FieldLabel>WhatsApp in full international form</FieldLabel>
      <Field
        value={whatsappE164}
        onChangeText={setWhatsappE164}
        placeholder="+233…"
        autoCapitalize="none"
      />

      <FieldLabel>Email</FieldLabel>
      <Field
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <FieldLabel>Address</FieldLabel>
      <Field value={address} onChangeText={setAddress} multiline numberOfLines={2} />

      <FieldLabel>Notes</FieldLabel>
      <Field value={notes} onChangeText={setNotes} multiline numberOfLines={2} />

      {error ? <ErrorText>{error}</ErrorText> : null}
      {saved ? <Text style={styles.saved}>Saved.</Text> : null}

      <PrimaryButton
        label={busy ? "Saving…" : "Save changes"}
        disabled={busy}
        onPress={() => void save()}
      />
    </Collapsible>
  );
}

const styles = StyleSheet.create({
  saved: { ...type.small, fontSize: 12, color: palette.green }
});
