import { useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { definedArgs, optionalText } from "@vetkeep/contracts";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import {
  clearPassportToken,
  generatePassportToken,
  passportUrl,
  readPassportToken,
  savePassportToken
} from "@/features/practice/passport";
import { Card, FieldLabel, Muted, ScrollScreen, Segmented } from "@/ui/practice-components";
import { PageHeader } from "@/ui/elements";
import { ErrorText, Field, PrimaryButton, SecondaryButton } from "@/ui/components";
import { fonts, hairline, palette, radiusControl, space, type } from "@/ui/tokens";

/**
 * Publishing an animal's passport (brief §10).
 *
 * A link a groomer or a boarding kennel can open to see identity and
 * vaccination status. The screen is built around the two things that are easy
 * to get wrong: it is the owner's decision, not the veterinarian's, and it is
 * published on the internet.
 */

const VISIBILITY = [
  { value: "hidden", label: "Hidden" },
  { value: "first_name", label: "First name" },
  { value: "full_name", label: "Full name" }
];

type PassportRow = {
  id: string;
  enabled: boolean;
  owner_name_visibility: string;
  show_microchip: boolean;
  consent_confirmed: boolean;
  enabled_at: string | null;
  revoked_at: string | null;
  rotated_at: string | null;
};

export default function PassportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const patientId = String(id);

  const [visibility, setVisibility] = useState("hidden");
  const [showMicrochip, setShowMicrochip] = useState(false);
  const [consent, setConsent] = useState(false);
  const [consentNotes, setConsentNotes] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data, reload } = useQuery<{
    patientName: string | null;
    passport: PassportRow | null;
    views: number;
  }>(async () => {
    const [patient, passport] = await Promise.all([
      supabase.from("patients").select("name").eq("id", patientId).maybeSingle(),
      supabase
        .from("patient_passports")
        .select(
          "id, enabled, owner_name_visibility, show_microchip, consent_confirmed, enabled_at, revoked_at, rotated_at"
        )
        .eq("patient_id", patientId)
        .maybeSingle()
    ]);

    let views = 0;
    if (passport.data) {
      const { count } = await supabase
        .from("passport_access_events")
        .select("id", { count: "exact", head: true })
        .eq("passport_id", passport.data.id);
      views = count ?? 0;
    }

    // The raw token lives only on this device; the server keeps a hash.
    setToken(await readPassportToken(patientId));
    if (passport.data) {
      setVisibility(passport.data.owner_name_visibility);
      setShowMicrochip(passport.data.show_microchip);
    }

    return {
      patientName: patient.data?.name ?? null,
      passport: (passport.data as PassportRow | null) ?? null,
      views
    };
  }, [patientId]);

  const passport = data?.passport ?? null;
  const live = passport?.enabled === true;
  const url = token ? passportUrl(token) : null;

  async function publish() {
    setError(null);
    setNotice(null);
    if (!consent) {
      setError("Record the owner's consent before publishing.");
      return;
    }

    setBusy(true);
    const fresh = generatePassportToken();
    const { error: rpcError } = await supabase.rpc(
      "enable_patient_passport",
      definedArgs({
        p_id: passport?.id ?? globalThis.crypto.randomUUID(),
        p_patient_id: patientId,
        p_token: fresh,
        p_consent_confirmed: true,
        p_owner_name_visibility: visibility,
        p_show_microchip: showMicrochip,
        p_consent_notes: optionalText(consentNotes)
      })
    );

    if (rpcError) {
      setBusy(false);
      setError(rpcError.message);
      return;
    }

    await savePassportToken(patientId, fresh);
    setToken(fresh);
    setBusy(false);
    setNotice("Passport published.");
    reload();
  }

  async function revoke() {
    setError(null);
    setNotice(null);
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("revoke_patient_passport", {
      p_patient_id: patientId
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await clearPassportToken(patientId);
    setToken(null);
    setNotice("Passport withdrawn. The link no longer answers.");
    reload();
  }

  async function rotate() {
    setError(null);
    setNotice(null);
    setBusy(true);
    const fresh = generatePassportToken();
    const { error: rpcError } = await supabase.rpc("rotate_passport_token", {
      p_patient_id: patientId,
      p_token: fresh
    });
    if (rpcError) {
      setBusy(false);
      setError(rpcError.message);
      return;
    }
    await savePassportToken(patientId, fresh);
    setToken(fresh);
    setBusy(false);
    setNotice("New link issued. Every code printed before now is dead.");
    reload();
  }

  return (
    <ScrollScreen>
      <PageHeader
        title="Health passport"
        subtitle={data?.patientName ? `A public link for ${data.patientName}` : "A public link"}
      />

      <Card>
        <View style={styles.head}>
          <Ionicons name="globe-outline" size={20} color={palette.brandInk} />
          <Text style={styles.headTitle}>What a stranger sees</Text>
        </View>
        <Muted>
          Name, species, breed, sex, markings, the animal&rsquo;s code, and vaccination dates. The
          veterinarian who vouches for it.
        </Muted>
        <Muted>
          Never the notes, the examination, the treatment plan or the prescriptions. A consultation
          appears only if you publish that consultation deliberately.
        </Muted>
      </Card>

      {live ? (
        <Card>
          <View style={styles.head}>
            <Ionicons name="checkmark-circle" size={20} color={palette.green} />
            <Text style={styles.headTitle}>Published</Text>
          </View>
          {url ? (
            <>
              <Text style={styles.url} selectable>
                {url}
              </Text>
              <SecondaryButton
                label="Share the link"
                onPress={() => void Share.share({ message: url })}
              />
            </>
          ) : (
            /* The hash is on the server; the raw token was only ever here. */
            <Muted>
              This passport is live, but the link was created on another device. Issue a new link
              below to get one you can share — the old one will stop working.
            </Muted>
          )}
          <Text style={styles.views}>
            Opened {data?.views ?? 0} {data?.views === 1 ? "time" : "times"}
          </Text>
        </Card>
      ) : null}

      <Card>
        <View style={styles.head}>
          <Ionicons name="person-outline" size={20} color={palette.quiet} />
          <Text style={styles.headTitle}>The owner decides</Text>
        </View>

        <FieldLabel>Show the owner&rsquo;s name as</FieldLabel>
        <Segmented
          options={VISIBILITY}
          value={visibility}
          onChange={setVisibility}
          accessibilityLabel="Owner name visibility"
        />

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: showMicrochip }}
          style={styles.check}
          onPress={() => setShowMicrochip(!showMicrochip)}
        >
          <Ionicons
            name={showMicrochip ? "checkbox" : "square-outline"}
            size={20}
            color={showMicrochip ? palette.amber : palette.quiet}
          />
          <Text style={styles.checkText}>
            Show the microchip number. This is how a stolen animal is traced — leave it off unless
            the owner asked for it.
          </Text>
        </Pressable>

        <FieldLabel>How consent was given (optional)</FieldLabel>
        <Field
          value={consentNotes}
          onChangeText={setConsentNotes}
          placeholder="Agreed in person at the farm"
          multiline
          numberOfLines={2}
        />

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consent }}
          style={styles.check}
          onPress={() => setConsent(!consent)}
        >
          <Ionicons
            name={consent ? "checkbox" : "square-outline"}
            size={20}
            color={consent ? palette.brandInk : palette.quiet}
          />
          <Text style={styles.checkText}>
            The owner agreed to this animal&rsquo;s details being published at a public link.
          </Text>
        </Pressable>

        {error ? <ErrorText>{error}</ErrorText> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <PrimaryButton
          label={busy ? "Working…" : live ? "Update the passport" : "Publish the passport"}
          disabled={busy || !consent}
          onPress={() => void publish()}
        />
      </Card>

      {live ? (
        <Card>
          <View style={styles.head}>
            <Ionicons name="warning-outline" size={20} color={palette.red} />
            <Text style={styles.headTitleDanger}>Stopping it</Text>
          </View>
          <Muted>
            Withdrawing takes the page down immediately. Issuing a new link keeps the passport but
            kills every code already printed, stuck to a kennel door, or saved by an owner — do it
            if a link has gone somewhere it should not have.
          </Muted>
          <SecondaryButton label="Issue a new link" onPress={() => void rotate()} />
          <PrimaryButton
            label={busy ? "Working…" : "Withdraw the passport"}
            disabled={busy}
            tone="danger"
            onPress={() => void revoke()}
          />
        </Card>
      ) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  headTitle: { ...type.strong, fontSize: 16, color: palette.ink },
  headTitleDanger: { ...type.strong, fontSize: 16, color: palette.red },
  url: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: palette.ink,
    backgroundColor: palette.ground,
    borderRadius: radiusControl,
    padding: space.md
  },
  views: {
    ...type.small,
    fontSize: 11,
    color: palette.quiet,
    borderTopWidth: hairline,
    borderTopColor: palette.line,
    paddingTop: space.md
  },
  check: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
    paddingVertical: space.sm
  },
  checkText: { ...type.small, fontSize: 12, color: palette.ink, flex: 1, lineHeight: 17 },
  notice: { ...type.small, fontSize: 12, color: palette.green }
});
