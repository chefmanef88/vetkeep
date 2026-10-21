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
import { radius, space } from "@/ui/tokens";

/**
 * Every folder, by the animal rather than by the owner.
 *
 * The application could already reach a folder through the client who owns it,
 * which is the right route when the telephone rings. It is the wrong route
 * standing in a pen holding an ear tag, or looking at a goat whose owner's name
 * has gone — and that is the case this screen is for.
 *
 * Deceased animals are included, unlike the home screen's recent list. A folder
 * that has ended is still a record, and a vet looking for one is usually looking
 * precisely because it ended.
 */

type FolderRow = {
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

function describe(folder: FolderRow): string {
  const profile = speciesProfile(folder.species);
  const base =
    folder.kind === "group"
      ? `${profile.groupNoun ?? "group"}${folder.head_count === null ? "" : ` of ${folder.head_count}`} · ${purposeLabel(folder.purpose)}`
      : `${profile.label}${folder.breed ? ` · ${folder.breed}` : ""}`;
  const capitalised = base.charAt(0).toUpperCase() + base.slice(1);
  return folder.status === "deceased" ? `${capitalised} · folder closed` : capitalised;
}

export function AnimalsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const {
    data,
    error: loadError,
    loading
  } = useQuery<FolderRow[]>(async () => {
    const { data: rows, error: queryError } = await supabase
      .from("patients")
      .select("id, name, patient_code, species, breed, kind, purpose, head_count, status")
      // Active first, so a working list is not led by folders that have ended.
      .is("deleted_at", null)
      .order("status", { ascending: true })
      .order("updated_at", { ascending: false });
    if (queryError) throw new Error("Could not load folders.");
    return (rows ?? []) as FolderRow[];
  }, []);

  const term = search.trim().toLowerCase();
  const all = data ?? [];
  const visible = all.filter(
    (folder) =>
      term === "" ||
      folder.name.toLowerCase().includes(term) ||
      folder.patient_code.toLowerCase().includes(term) ||
      folder.species.toLowerCase().includes(term) ||
      (folder.breed ?? "").toLowerCase().includes(term)
  );

  return (
    <ScrollScreen topInset tabBarInset>
      <ScreenTopBar title="Animals" />
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Name, code, species or breed"
      />

      {loading ? <ActivityIndicator /> : null}
      {loadError ? <ErrorText>{loadError}</ErrorText> : null}

      {visible.length > 0 ? (
        <>
          <ListHeader title={term === "" ? "All folders" : "Matching"} count={visible.length} />
          <View style={styles.list}>
            {visible.map((folder) => (
              <PersonRow
                key={folder.id}
                name={folder.name}
                code={folder.patient_code}
                meta={describe(folder)}
                // A closed folder reads differently from a living one, which
                // matters most in a list where they sit next to each other.
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

      {!loading && all.length === 0 ? (
        <EmptyState
          icon="paw-outline"
          title="No folders yet"
          hint="Animals are added under the client who owns them. Open a client to add the first one."
        />
      ) : null}

      {!loading && all.length > 0 && visible.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title="Nothing matches"
          hint="Try the animal's code, or the species."
        />
      ) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: radius, overflow: "hidden", marginBottom: space.md }
});
