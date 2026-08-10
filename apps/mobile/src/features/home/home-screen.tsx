import { useRouter } from "expo-router";
import { View, StyleSheet } from "react-native";
import { purposeLabel, speciesProfile } from "@vetkeep/domain";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import { useSync } from "@/sync/sync-provider";
import { PrimaryButton } from "@/ui/components";
import { ScrollScreen } from "@/ui/practice-components";
import { EmptyState, ListHeader, PageHeader, PersonRow, StatTile } from "@/ui/elements";
import { useSession } from "@/auth/session-provider";
import { MenuButton } from "@/ui/app-menu";
import { radius, space } from "@/ui/tokens";

type RecentFolder = {
  id: string;
  name: string;
  patient_code: string;
  species: string;
  kind: string;
  purpose: string;
  breed: string | null;
  head_count: number | null;
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** First name only. "Good morning, Kwame" reads like a person, not a record. */
function firstName(full: string | null | undefined): string {
  if (!full) return "there";
  return full.trim().split(/\s+/)[0] ?? "there";
}

function describeFolder(folder: RecentFolder): string {
  const profile = speciesProfile(folder.species);
  if (folder.kind === "group") {
    const noun = profile.groupNoun ?? "group";
    const head = folder.head_count === null ? "" : ` of ${folder.head_count}`;
    return `${noun.charAt(0).toUpperCase()}${noun.slice(1)}${head} · ${purposeLabel(folder.purpose)}`;
  }
  return `${profile.label}${folder.breed ? ` · ${folder.breed}` : ""}`;
}

export function HomeScreen() {
  const { profile } = useSession();
  const { pendingCount, conflicts, deadLetters } = useSync();
  const router = useRouter();

  /**
   * Recently touched folders, not a diary. Work arrives by telephone (brief
   * §11), so the useful question on opening the app is "which folder do I need",
   * and the answer is most often one seen lately.
   */
  const { data: recent } = useQuery<RecentFolder[]>(async () => {
    const { data: rows, error: queryError } = await supabase
      .from("patients")
      .select("id, name, patient_code, species, kind, purpose, breed, head_count")
      .is("deleted_at", null)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(5);
    if (queryError) throw new Error("Could not load recent folders.");
    return (rows ?? []) as RecentFolder[];
  }, []);

  const { data: folderCount } = useQuery<number>(async () => {
    const { count, error: queryError } = await supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "active");
    if (queryError) throw new Error("Could not count folders.");
    return count ?? 0;
  }, []);

  const needsAttention = conflicts.length + deadLetters.length;

  return (
    <ScrollScreen topInset>
      {/* Home is the root, so nothing owns the leading edge and the menu can
          sit where it was asked for. Sub-screens keep the back arrow there and
          carry the menu on the trailing edge instead. */}
      <View style={styles.topBar}>
        <MenuButton />
      </View>

      <PageHeader
        title={`${greeting()}, ${firstName(profile?.full_name)}`}
        subtitle={new Date().toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long"
        })}
      />

      <View style={styles.statRow}>
        <StatTile
          icon="folder-open"
          label="Folders"
          value={folderCount ?? "—"}
          tone="brand"
          onPress={() => router.push("/practice/clients")}
        />
        <StatTile
          icon={needsAttention > 0 ? "alert-circle" : "cloud-done"}
          label={needsAttention > 0 ? "Need you" : "Waiting to send"}
          value={needsAttention > 0 ? needsAttention : pendingCount}
          tone={needsAttention > 0 ? "warn" : pendingCount > 0 ? "neutral" : "good"}
          onPress={() => router.push("/practice/sync")}
        />
      </View>

      {/* Finding the folder is the act that starts everything, so it is the
          primary action. There is nothing to "start": the day is not booked. */}
      <PrimaryButton
        label="Find a client or animal"
        onPress={() => router.push("/practice/clients")}
      />

      {recent && recent.length > 0 ? (
        <>
          <ListHeader title="Recently opened" count={recent.length} />
          <View style={styles.list}>
            {recent.map((folder) => (
              <PersonRow
                key={folder.id}
                name={folder.name}
                code={folder.patient_code}
                meta={describeFolder(folder)}
                tone={folder.kind === "group" ? "warn" : "good"}
                onPress={() =>
                  router.push({ pathname: "/practice/patient/[id]", params: { id: folder.id } })
                }
              />
            ))}
          </View>
        </>
      ) : null}

      {recent && recent.length === 0 ? (
        <EmptyState
          icon="folder-outline"
          title="No folders yet"
          hint="Add a client, then an animal or a flock. Each one becomes a folder that records build up in."
        />
      ) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", marginLeft: -space.sm },
  statRow: { flexDirection: "row", gap: space.md },
  list: { borderRadius: radius, overflow: "hidden" }
});
