import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { generateVisitRecordCode, purposeLabel, speciesProfile } from "@vetkeep/domain";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import { EditPatientSection, type EditablePatient } from "@/features/practice/edit-patient-section";
import { confirmWithDevice } from "@/security/confirm-with-device";
import { usePatientPhoto } from "@/features/practice/use-patient-photo";
import { FolderPhoto } from "@/features/practice/folder-photo";
import { WithholdingBanner } from "@/features/practice/treatments-section";
import { PreventiveSection } from "@/features/practice/preventive-section";
import { shareFolder } from "@/features/records/share-record";
import { Card, FieldLabel, Muted, ScrollScreen, Segmented } from "@/ui/practice-components";
import { Avatar, CodeChip, Collapsible, EmptyState, InfoRow, ListHeader } from "@/ui/elements";
import { ErrorText, Field, PrimaryButton, SecondaryButton } from "@/ui/components";
import { SyncBanner } from "@/sync/sync-banner";
import { fonts, hairline, palette, radius, radiusPill, shadowCard, space, type } from "@/ui/tokens";

type Folder = {
  id: string;
  patient_code: string;
  name: string;
  kind: string;
  species: string;
  purpose: string;
  breed: string | null;
  sex: string | null;
  date_of_birth: string | null;
  date_of_birth_precision: string;
  color_markings: string | null;
  microchip_id: string | null;
  ear_tag: string | null;
  leg_ring: string | null;
  identification_notes: string | null;
  head_count: number | null;
  group_age_weeks: number | null;
  housing: string | null;
  status: string;
  profile_photo_attachment_id: string | null;
  server_version: number;
};

type RecordRow = {
  id: string;
  visit_date: string;
  visit_type: string;
  workflow_status: string;
  chief_complaint: string | null;
  definitive_diagnosis: string | null;
  tentative_diagnosis: string | null;
};

type Loaded = { folder: Folder; records: RecordRow[] };

/**
 * The kinds of attendance a house-call vet actually makes. Scheduling is gone
 * (brief §11), so this describes what the visit was, not what was booked.
 */
const RECORD_TYPES = [
  { value: "home_call", label: "Home" },
  { value: "field_visit", label: "Farm" },
  { value: "follow_up", label: "Follow-up" },
  { value: "emergency", label: "Emergency", tone: "warn" as const }
];

function formatDay(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

/** Age as a person would say it, from a stored date and its precision. */
function describeAge(dob: string | null, precision: string): string | null {
  if (!dob) return null;
  const born = new Date(dob);
  const now = new Date();
  let months = (now.getFullYear() - born.getFullYear()) * 12 + (now.getMonth() - born.getMonth());
  if (now.getDate() < born.getDate()) months -= 1;
  if (months < 0) return null;

  const years = Math.floor(months / 12);
  const remainder = months % 12;
  const spoken =
    years === 0
      ? `${remainder} month${remainder === 1 ? "" : "s"}`
      : remainder === 0
        ? `${years} year${years === 1 ? "" : "s"}`
        : `${years}y ${remainder}m`;

  // An estimate is never presented as though it were a certificate.
  return precision === "exact" ? spoken : `about ${spoken}`;
}

export default function PatientFolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [recordType, setRecordType] = useState("home_call");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, error, loading, reload } = useQuery<Loaded>(async () => {
    const patientId = String(id);
    const [folderResult, recordsResult] = await Promise.all([
      supabase
        .from("patients")
        .select(
          "id, patient_code, name, kind, species, purpose, breed, sex, date_of_birth, date_of_birth_precision, color_markings, microchip_id, ear_tag, leg_ring, identification_notes, head_count, group_age_weeks, housing, status, profile_photo_attachment_id, server_version"
        )
        .eq("id", patientId)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("visits")
        .select(
          "id, visit_date, visit_type, workflow_status, chief_complaint, definitive_diagnosis, tentative_diagnosis"
        )
        .eq("patient_id", patientId)
        .is("deleted_at", null)
        .order("visit_date", { ascending: false })
    ]);

    if (folderResult.error || !folderResult.data) throw new Error("Could not load this folder.");
    return {
      folder: folderResult.data as Folder,
      records: (recordsResult.data ?? []) as RecordRow[]
    };
  }, [id]);

  // Coming back from a record means it may have been written to or signed, so
  // the list behind it is stale the moment the vet returns.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  // Before the early returns below: hooks cannot be called conditionally.
  const photoUri = usePatientPhoto(data?.folder.profile_photo_attachment_id);

  async function startRecord() {
    setBusy(true);
    setActionError(null);
    const recordId = globalThis.crypto.randomUUID();
    // No appointment is involved. A record is created by the act of attending.
    const { error: rpcError } = await supabase.rpc("create_visit", {
      p_id: recordId,
      p_patient_id: String(id),
      p_visit_date: new Date().toISOString(),
      p_visit_type: recordType,
      // Minted here, offline, so the record carries the reference the client
      // will be given from the moment it exists.
      p_record_code: generateVisitRecordCode()
    });
    setBusy(false);
    if (rpcError) {
      setActionError(rpcError.message);
      return;
    }
    router.push(`/practice/visit/${recordId}`);
  }

  async function shareWholeFolder() {
    setShareError(null);
    // Sending clinical records out of the app re-authenticates. See
    // confirm-with-device for why this is the device credential rather than an
    // application PIN.
    const confirmed = await confirmWithDevice("Confirm sharing this animal's full history");
    if (!confirmed) return;

    setSharing(true);
    const outcome = await shareFolder(String(id));
    setSharing(false);
    if (!outcome.ok) setShareError(outcome.message);
  }

  async function deleteFolder() {
    setDeleteError(null);
    if (deleteReason.trim().length < 3) {
      setDeleteError("Say why this folder is being removed. It goes on the record.");
      return;
    }

    const confirmed = await confirmWithDevice("Confirm removing this folder");
    if (!confirmed) return;

    setDeleting(true);
    // Soft delete: the folder stops appearing, the records and the audit event
    // remain. delete_patient writes 'patient.deleted' with the reason.
    const { error: rpcError } = await supabase.rpc("delete_patient", {
      p_id: String(id),
      p_reason: deleteReason.trim()
    });
    setDeleting(false);
    if (rpcError) {
      setDeleteError(rpcError.message);
      return;
    }
    router.back();
  }

  if (loading && !data) {
    return (
      <ScrollScreen>
        <ActivityIndicator />
      </ScrollScreen>
    );
  }
  if (error || !data) {
    return (
      <ScrollScreen>
        <Card>
          <ErrorText>{error ?? "This folder is unavailable."}</ErrorText>
        </Card>
      </ScrollScreen>
    );
  }

  const { folder, records } = data;
  const profile = speciesProfile(folder.species);
  const isGroup = folder.kind === "group";
  const age = describeAge(folder.date_of_birth, folder.date_of_birth_precision);
  const identifier = folder.microchip_id ?? folder.ear_tag ?? folder.leg_ring;
  const identifierLabel = folder.microchip_id
    ? "Microchip"
    : folder.ear_tag
      ? "Ear tag"
      : folder.leg_ring
        ? "Leg ring"
        : null;
  const openRecord = records.find((record) => record.workflow_status === "draft");

  return (
    <ScrollScreen>
      <SyncBanner />

      <View style={styles.header}>
        <Avatar name={folder.name} tone={isGroup ? "warn" : "good"} photoUri={photoUri} />
        <View style={styles.headerBody}>
          <Text style={styles.headerName} numberOfLines={1}>
            {folder.name}
          </Text>
          <Text style={styles.headerMeta}>
            {isGroup
              ? `${profile.label} ${profile.groupNoun ?? "group"}${folder.head_count === null ? "" : ` · ${folder.head_count} head`}`
              : `${profile.label}${folder.breed ? ` · ${folder.breed}` : ""}`}
          </Text>
        </View>
        <View style={styles.purpose}>
          <Text style={styles.purposeText}>{purposeLabel(folder.purpose)}</Text>
        </View>
      </View>
      <View style={styles.codeRow}>
        <CodeChip>{folder.patient_code}</CodeChip>
      </View>

      {/* Above everything else: a farmer selling milk under withholding is the
          most consequential mistake this app can help avoid. */}
      <WithholdingBanner patientId={folder.id} />

      <Card>
        <FolderPhoto
          patientId={folder.id}
          name={folder.name}
          photoUri={photoUri}
          hasPhoto={folder.profile_photo_attachment_id !== null}
          onChanged={reload}
        />
      </Card>

      {/* Standing information. Corrected in place as the vet learns more, unlike
          the records below, which only ever accumulate. */}
      <Card>
        {isGroup ? (
          <>
            {folder.head_count !== null ? (
              <InfoRow
                icon="stats-chart-outline"
                label="Head count"
                value={`${folder.head_count}`}
              />
            ) : null}
            {folder.group_age_weeks !== null ? (
              <InfoRow icon="time-outline" label="Age" value={`${folder.group_age_weeks} weeks`} />
            ) : null}
            {folder.housing ? (
              <InfoRow icon="home-outline" label="Housing" value={folder.housing} />
            ) : null}
          </>
        ) : (
          <>
            {folder.sex ? (
              <InfoRow
                icon="male-female-outline"
                label="Sex"
                value={folder.sex.replace("_", " ")}
              />
            ) : null}
            {age ? <InfoRow icon="time-outline" label="Age" value={age} /> : null}
            {folder.color_markings ? (
              <InfoRow
                icon="color-palette-outline"
                label="Markings"
                value={folder.color_markings}
              />
            ) : null}
          </>
        )}
        {identifier && identifierLabel ? (
          <InfoRow icon="pricetag-outline" label={identifierLabel} value={identifier} />
        ) : null}
        {folder.identification_notes ? (
          <InfoRow icon="document-text-outline" label="Notes" value={folder.identification_notes} />
        ) : null}
        {folder.purpose !== "pet" && profile.withdrawals.length > 0 ? (
          <Muted>
            Kept for {purposeLabel(folder.purpose).toLowerCase()}. Treatments require{" "}
            {profile.withdrawals.join(" and ")} withholding periods.
          </Muted>
        ) : null}

        {/* The last line of this card, not a block of its own. */}
        <EditPatientSection patient={folder as EditablePatient} onSaved={reload} />
      </Card>

      {/* Creating a record is the point of opening a folder, so it sits above
          the history rather than below it. */}
      <Card>
        <FieldLabel>New record</FieldLabel>
        <Segmented
          options={RECORD_TYPES}
          value={recordType}
          onChange={setRecordType}
          accessibilityLabel="Type of attendance"
        />
        {actionError ? <ErrorText>{actionError}</ErrorText> : null}
        {openRecord ? (
          <Muted>
            There is already an unsigned record from {formatDay(openRecord.visit_date)}. Open it
            below rather than starting another.
          </Muted>
        ) : null}
        <PrimaryButton
          label={busy ? "Opening…" : "Start a record now"}
          disabled={busy}
          onPress={() => void startRecord()}
        />
      </Card>

      {/* Standing protection, not a consultation: what this animal has had and
          what is due, whether or not anyone attended today. */}
      <PreventiveSection patientId={folder.id} species={folder.species} isGroup={isGroup} />

      {records.length > 0 ? <ListHeader title="Records" count={records.length} /> : null}

      {records.map((record) => {
        const signed = record.workflow_status !== "draft";
        const summary =
          record.definitive_diagnosis ?? record.tentative_diagnosis ?? record.chief_complaint;
        return (
          <View key={record.id} style={styles.recordRow}>
            <View style={styles.recordHead}>
              <Text style={styles.recordDate}>{formatDay(record.visit_date)}</Text>
              <View style={[styles.state, signed ? styles.stateSigned : styles.stateOpen]}>
                <Text style={[styles.stateText, signed && styles.stateTextSigned]}>
                  {signed ? record.workflow_status : "Open"}
                </Text>
              </View>
            </View>
            {summary ? (
              <Text style={styles.recordSummary} numberOfLines={2}>
                {summary}
              </Text>
            ) : (
              <Text style={styles.recordEmpty}>Nothing recorded yet</Text>
            )}
            <PrimaryButton
              label={signed ? "Read the record" : "Continue the record"}
              onPress={() => router.push(`/practice/visit/${record.id}`)}
            />
          </View>
        );
      })}

      {!loading && records.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title="No records yet"
          hint="Every time you attend this folder, a dated record is added here and never overwritten."
        />
      ) : null}

      {records.some((entry) => entry.workflow_status !== "draft") ? (
        <Card>
          <FieldLabel>Give the client the whole history</FieldLabel>
          <Muted>
            Every signed record for {folder.name}, newest first. This is what another veterinarian
            needs if the animal is referred or changes hands.
          </Muted>
          {shareError ? <ErrorText>{shareError}</ErrorText> : null}
          <SecondaryButton
            label={sharing ? "Preparing…" : "Share the full history"}
            onPress={() => void shareWholeFolder()}
          />
        </Card>
      ) : null}

      {/* The passport is a different disclosure from the client's copy: a
          public link for a third party, restricted to identity and vaccination
          status. The two never share an implementation (§10.6). */}
      <Card>
        <FieldLabel>Public health passport</FieldLabel>
        <Muted>
          A link a groomer or boarding kennel can open to check {folder.name} is vaccinated. It
          shows no clinical detail, and it needs the owner&rsquo;s consent.
        </Muted>
        <SecondaryButton
          label="Manage the passport"
          onPress={() =>
            router.push({ pathname: "/practice/passport/[id]", params: { id: folder.id } })
          }
        />
      </Card>

      <Collapsible title="Remove this folder" icon="trash" tone="bad">
        <Muted>
          The folder stops appearing in your lists. Its {records.length} record
          {records.length === 1 ? "" : "s"} are kept, along with the reason you give, because a
          signed medical record is not yours to destroy and you may need it later. To withdraw a
          single record, open it instead.
        </Muted>
        <FieldLabel>Why</FieldLabel>
        <Field
          value={deleteReason}
          onChangeText={setDeleteReason}
          placeholder="Animal sold, duplicate folder, entered in error"
        />
        {deleteError ? <ErrorText>{deleteError}</ErrorText> : null}
        <SecondaryButton
          label={deleting ? "Removing…" : "Remove folder"}
          onPress={() => void deleteFolder()}
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
  headerBody: { flex: 1, gap: 1 },
  headerName: { ...type.heading, fontSize: 22, color: palette.ink },
  headerMeta: { ...type.small, color: palette.quiet },
  purpose: {
    backgroundColor: palette.brandSoft,
    borderRadius: radiusPill,
    paddingHorizontal: space.md,
    paddingVertical: 4
  },
  purposeText: { fontFamily: fonts.semibold, fontSize: 11, color: palette.brandInk },
  codeRow: { paddingHorizontal: space.xs, flexDirection: "row" },
  recordRow: {
    backgroundColor: palette.surface,
    borderRadius: radius,
    borderWidth: hairline,
    borderColor: palette.line,
    padding: space.lg,
    gap: space.sm,
    ...shadowCard
  },
  recordHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  recordDate: { ...type.strong, color: palette.ink },
  state: { borderRadius: radiusPill, paddingHorizontal: space.md, paddingVertical: 3 },
  stateOpen: { backgroundColor: palette.brandSoft },
  stateSigned: { backgroundColor: palette.greenSoft },
  stateText: { fontFamily: fonts.semibold, fontSize: 11, color: palette.brandInk },
  stateTextSigned: { color: palette.green },
  recordSummary: { ...type.small, color: palette.ink },
  recordEmpty: { ...type.small, color: palette.quiet, fontStyle: "italic" }
});
