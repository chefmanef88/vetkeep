import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { purposeLabel, speciesProfile } from "@vetkeep/domain";

import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import { ScrollScreen } from "@/ui/practice-components";
import { EmptyState, ListHeader, PersonRow, SearchField } from "@/ui/elements";
import { ErrorText } from "@/ui/components";
import { ScreenTopBar } from "@/ui/screen-top-bar";
import { palette, radius, space, type } from "@/ui/tokens";
import { Text } from "react-native";

/**
 * One field that finds either side of the record.
 *
 * The old home screen offered "Find a client or animal" and then showed a list
 * of clients, which answered half of it. A vet rung about "Kofi's goat" has the
 * owner; a vet standing over an ear tag has the animal; and the person asking
 * has no reason to care which table the answer is in. So this searches both and
 * says which is which.
 *
 * Nothing is fetched until two characters are typed. The whole point is to
 * avoid pulling every client and every folder down a weak connection to answer
 * a question that has not been asked yet.
 */

const MIN_TERM = 2;

type ClientHit = {
  id: string;
  client_code: string;
  name: string;
  phone_display: string;
};

type FolderHit = {
  id: string;
  name: string;
  patient_code: string;
  species: string;
  breed: string | null;
  kind: string;
  purpose: string;
  head_count: number | null;
  status: string;
};

function describeFolder(folder: FolderHit): string {
  const profile = speciesProfile(folder.species);
  const base =
    folder.kind === "group"
      ? `${profile.groupNoun ?? "group"}${folder.head_count === null ? "" : ` of ${folder.head_count}`} · ${purposeLabel(folder.purpose)}`
      : `${profile.label}${folder.breed ? ` · ${folder.breed}` : ""}`;
  const capitalised = base.charAt(0).toUpperCase() + base.slice(1);
  return folder.status === "deceased" ? `${capitalised} · folder closed` : capitalised;
}

/** Escapes the wildcards so a term containing % or _ matches literally. */
function likeTerm(term: string): string {
  return `%${term.replace(/[%_\\]/g, (match) => `\\${match}`)}%`;
}

export function SearchScreen() {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const trimmed = term.trim();
  const ready = trimmed.length >= MIN_TERM;

  const {
    data,
    error: loadError,
    loading
  } = useQuery<{ clients: ClientHit[]; folders: FolderHit[] }>(async () => {
    if (!ready) return { clients: [], folders: [] };

    const pattern = likeTerm(trimmed);
    // Both sides at once: the vet is waiting on one answer, not two.
    const [clientResult, folderResult] = await Promise.all([
      supabase
        .from("clients")
        .select("id, client_code, name, phone_display")
        .is("deleted_at", null)
        .or(`name.ilike.${pattern},client_code.ilike.${pattern},phone_display.ilike.${pattern}`)
        .order("name")
        .limit(15),
      supabase
        .from("patients")
        .select("id, name, patient_code, species, breed, kind, purpose, head_count, status")
        .is("deleted_at", null)
        .or(`name.ilike.${pattern},patient_code.ilike.${pattern},species.ilike.${pattern}`)
        .order("updated_at", { ascending: false })
        .limit(15)
    ]);

    if (clientResult.error || folderResult.error) throw new Error("Could not search.");

    return {
      clients: (clientResult.data ?? []) as ClientHit[],
      folders: (folderResult.data ?? []) as FolderHit[]
    };
  }, [trimmed, ready]);

  const clients = data?.clients ?? [];
  const folders = data?.folders ?? [];
  const nothing = ready && !loading && clients.length === 0 && folders.length === 0;

  return (
    <ScrollScreen topInset tabBarInset>
      <ScreenTopBar title="Search" />
      <SearchField
        value={term}
        onChangeText={setTerm}
        placeholder="Client, animal, code or phone"
        autoFocus
      />

      {!ready ? (
        <Text style={styles.hint}>
          Type at least {MIN_TERM} letters. Names, reference codes and phone numbers all work.
        </Text>
      ) : null}

      {loading && ready ? <ActivityIndicator /> : null}
      {loadError ? <ErrorText>{loadError}</ErrorText> : null}

      {folders.length > 0 ? (
        <>
          <ListHeader title="Animals" count={folders.length} />
          <View style={styles.list}>
            {folders.map((folder) => (
              <PersonRow
                key={folder.id}
                name={folder.name}
                code={folder.patient_code}
                meta={describeFolder(folder)}
                tone={
                  folder.status === "deceased"
                    ? "neutral"
                    : folder.kind === "group"
                      ? "warn"
                      : "good"
                }
                onPress={() =>
                  router.push({ pathname: "/practice/patient/[id]", params: { id: folder.id } })
                }
              />
            ))}
          </View>
        </>
      ) : null}

      {clients.length > 0 ? (
        <>
          <ListHeader title="Clients" count={clients.length} />
          <View style={styles.list}>
            {clients.map((client) => (
              <PersonRow
                key={client.id}
                name={client.name}
                code={client.client_code}
                meta={client.phone_display}
                tone="brand"
                onPress={() =>
                  router.push({ pathname: "/practice/client/[id]", params: { id: client.id } })
                }
              />
            ))}
          </View>
        </>
      ) : null}

      {nothing ? (
        <EmptyState
          icon="search-outline"
          title="Nothing matches"
          hint="Reference codes are exact, so a partial code works. Phone numbers match as they are written."
        />
      ) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: radius, overflow: "hidden", marginBottom: space.md },
  hint: { ...type.small, color: palette.quiet }
});
