import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { definedArgs, optionalNumber, optionalText } from "@vetkeep/contracts";
import { sortByExamOrder } from "@vetkeep/domain";
import { supabase } from "@/lib/supabase";
import { useSync } from "@/sync/sync-provider";
import { SyncBanner } from "@/sync/sync-banner";
import { AttachmentsSection } from "@/features/practice/attachments-section";
import { TreatmentsSection } from "@/features/practice/treatments-section";
import { useQuery } from "@/features/practice/use-query";
import {
  clearDraft,
  differsFrom,
  loadDraft,
  saveDraft as persistTyping
} from "@/features/practice/draft-store";
import {
  draftFromVisit,
  type ConsumedMovement,
  type DraftForm,
  type ExamFinding,
  type UsableBatch,
  type VisitRow
} from "@/features/practice/visit-types";
import { Body, ErrorText, Field, PrimaryButton, SecondaryButton } from "@/ui/components";
import {
  Card,
  FieldLabel,
  Muted,
  ScrollScreen,
  SectionTitle,
  Segmented
} from "@/ui/practice-components";
import { Avatar, CodeChip, Collapsible, ProgressBar } from "@/ui/elements";
import { confirmWithDevice } from "@/security/confirm-with-device";
import { shareRecord } from "@/features/records/share-record";
import { fonts, palette, radiusControl, radiusPill, space, type } from "@/ui/tokens";

const EXAM_OPTIONS = [
  { value: "not_examined", label: "Not yet" },
  { value: "normal", label: "Normal" },
  { value: "abnormal", label: "Abnormal", tone: "warn" as const },
  { value: "not_applicable", label: "N/A" }
];

type Loaded = {
  visit: VisitRow;
  findings: ExamFinding[];
  batches: UsableBatch[];
  consumed: ConsumedMovement[];
};

/** How many of a set of free-text answers have been given. */
function filledCount(values: string[]): number {
  return values.filter((value) => value.trim() !== "").length;
}

export default function VisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { record } = useSync();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /**
   * Three layers, resolved in order: what the vet has typed this session, what
   * the device was holding from a previous one, and what the server last saved.
   * Derived rather than copied into state, so there is no moment where the
   * screen is showing one and about to be overwritten by another.
   */
  const [edits, setEdits] = useState<DraftForm | null>(null);
  const [heldTyping, setHeldTyping] = useState<DraftForm | null>(null);
  const [localChecked, setLocalChecked] = useState(false);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  const { data, error, loading, reload } = useQuery<Loaded>(async () => {
    const visitId = String(id);
    const today = new Date().toISOString().slice(0, 10);

    const [visitResult, findingsResult, batchesResult, movementsResult] = await Promise.all([
      supabase
        .from("visits")
        .select("*, patients(name, species, breed, patient_code, purpose, kind)")
        .eq("id", visitId)
        .maybeSingle(),
      supabase
        .from("physical_exam_findings")
        .select("id, system_name, status, remarks, server_version")
        .eq("visit_id", visitId)
        .order("system_name", { ascending: true }),
      supabase
        .from("inventory_batches")
        .select(
          "id, batch_lot_number, expiry_date, quantity_on_hand, inventory_items(item_name, unit)"
        )
        .is("deleted_at", null)
        .gt("quantity_on_hand", 0)
        .or(`expiry_date.is.null,expiry_date.gte.${today}`),
      supabase
        .from("inventory_movements")
        .select(
          "id, quantity, notes, inventory_batches(batch_lot_number, inventory_items(item_name, unit))"
        )
        .eq("visit_id", visitId)
        .eq("movement_type", "consumption")
        .order("created_at", { ascending: true })
    ]);

    if (visitResult.error || !visitResult.data) throw new Error("Could not load this visit.");

    const visit = visitResult.data as unknown as VisitRow;

    return {
      visit,
      // Ordered head to tail rather than alphabetically: an examination read
      // down the screen is a checklist, one that jumps around the animal is not.
      findings: sortByExamOrder((findingsResult.data ?? []) as ExamFinding[]),
      batches: (batchesResult.data ?? []) as unknown as UsableBatch[],
      consumed: (movementsResult.data ?? []) as unknown as ConsumedMovement[]
    };
  }, [id]);

  const visitId = String(id);
  const serverVersion = data?.visit.server_version ?? null;

  // Ask the device first. Typing that never reached the server lives only here,
  // and restoring it must win over the saved copy rather than race with it.
  useEffect(() => {
    let active = true;
    void loadDraft(visitId).then((stored) => {
      if (!active) return;
      if (stored) {
        setHeldTyping(stored.form);
        setRestoredAt(stored.savedAt);
      }
      setLocalChecked(true);
    });
    return () => {
      active = false;
    };
  }, [visitId]);

  const draft: DraftForm | null = edits ?? heldTyping ?? (data ? draftFromVisit(data.visit) : null);

  /**
   * Held on the device as the vet types, debounced so a long note is not
   * writing to the keystore on every keystroke. A signed record is not a draft
   * and is never stored this way.
   */
  useEffect(() => {
    if (!draft || !localChecked || serverVersion === null) return;
    if (data?.visit.workflow_status !== "draft") return;
    const timer = setTimeout(() => {
      void persistTyping(visitId, draft, serverVersion).catch(() => {
        // A failed local save must not interrupt the consultation. The record
        // is still in memory and the Save button still works.
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [draft, localChecked, serverVersion, visitId, data?.visit.workflow_status]);

  if ((loading && !data) || !localChecked) {
    return (
      <ScrollScreen>
        <ActivityIndicator />
      </ScrollScreen>
    );
  }
  if (error || !data || !draft) {
    return (
      <ScrollScreen>
        <Card>
          <ErrorText>{error ?? "This visit is unavailable."}</ErrorText>
        </Card>
      </ScrollScreen>
    );
  }

  const { visit, findings, batches, consumed } = data;
  const isDraft = visit.workflow_status === "draft";
  const notExamined = findings.filter((f) => f.status === "not_examined").length;
  const examined = findings.length - notExamined;
  const abnormal = findings.filter((f) => f.status === "abnormal").length;

  const historyFilled = filledCount([
    draft.chiefComplaint,
    draft.historyOfComplaint,
    draft.pastMedicalHistory,
    draft.currentMedications
  ]);
  const vitalsFilled = filledCount([
    draft.temperatureC,
    draft.heartRateBpm,
    draft.respiratoryRateBpm,
    draft.weightValue,
    draft.bodyConditionScore,
    draft.painScore
  ]);
  const planFilled = filledCount([
    draft.problemList,
    draft.differentialDiagnoses,
    draft.tentativeDiagnosis,
    draft.definitiveDiagnosis,
    draft.treatmentPlan,
    draft.prescriptions,
    draft.followUpPlan,
    draft.nextReviewDate
  ]);

  const set = (key: keyof DraftForm, value: string) =>
    setEdits((current) => ({ ...(current ?? draft ?? ({} as DraftForm)), [key]: value }));

  async function saveDraft() {
    setSaving(true);
    setActionError(null);
    setStatus(null);

    try {
      // Queued rather than sent directly. The vet is often standing in a yard
      // with no signal, and the note has to survive that.
      const { sentNow } = await record({
        // One id per visit draft, so repeated saves replace the queued write
        // instead of stacking a dozen copies of the same consultation.
        mutationId: `visit_draft:${visit.id}`,
        entityType: "visit_draft",
        entityId: visit.id,
        operation: "update",
        rpcName: "update_visit_draft",
        baseServerVersion: visit.server_version,
        payload: definedArgs({
          p_id: visit.id,
          p_visit_date: visit.visit_date,
          p_visit_type: visit.visit_type,
          p_chief_complaint: optionalText(draft!.chiefComplaint),
          p_history_of_complaint: optionalText(draft!.historyOfComplaint),
          p_past_medical_history: optionalText(draft!.pastMedicalHistory),
          p_current_medications: optionalText(draft!.currentMedications),
          p_temperature_c: optionalNumber(draft!.temperatureC),
          p_heart_rate_bpm: optionalNumber(draft!.heartRateBpm),
          p_respiratory_rate_bpm: optionalNumber(draft!.respiratoryRateBpm),
          p_weight_value: optionalNumber(draft!.weightValue),
          p_body_condition_score: optionalText(draft!.bodyConditionScore),
          p_pain_score: optionalText(draft!.painScore),
          p_problem_list: optionalText(draft!.problemList),
          p_differential_diagnoses: optionalText(draft!.differentialDiagnoses),
          p_tentative_diagnosis: optionalText(draft!.tentativeDiagnosis),
          p_definitive_diagnosis: optionalText(draft!.definitiveDiagnosis),
          p_treatment_plan: optionalText(draft!.treatmentPlan),
          p_prescriptions: optionalText(draft!.prescriptions),
          p_follow_up_plan: optionalText(draft!.followUpPlan),
          p_next_review_date: optionalText(draft!.nextReviewDate),
          p_base_server_version: visit.server_version
        }) as Record<string, unknown>
      });

      // The queue owns the work now, so the local copy is discarded. Keeping
      // both would leave two stores claiming to hold the truth, and a stale
      // local draft would later overwrite a saved record on reopening.
      await clearDraft(visitId);
      setRestoredAt(null);

      // Never just "Saved" when it is only on the phone: the vet decides
      // differently about leaving a compound if the record has not left with them.
      setStatus(
        sentNow ? "Saved and sent." : "Saved on this phone. It will send when you have signal."
      );
      if (sentNow) reload();
    } catch (thrown: unknown) {
      setActionError(thrown instanceof Error ? thrown.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function setFinding(
    systemName: string,
    nextStatus: string,
    remarks: string | null,
    baseServerVersion: number
  ) {
    setActionError(null);
    try {
      const { sentNow } = await record({
        mutationId: `exam_finding:${visit.id}:${systemName}`,
        entityType: "exam_finding",
        entityId: visit.id,
        operation: "update",
        rpcName: "set_exam_finding",
        baseServerVersion,
        payload: definedArgs({
          p_visit_id: visit.id,
          p_system_name: systemName,
          p_status: nextStatus,
          p_remarks: optionalText(remarks),
          p_base_server_version: baseServerVersion
        }) as Record<string, unknown>
      });
      if (sentNow) reload();
    } catch (thrown: unknown) {
      setActionError(thrown instanceof Error ? thrown.message : "Could not record the finding.");
    }
  }

  async function giveClientACopy() {
    setActionError(null);
    // Sending clinical information out of the app re-authenticates.
    const confirmed = await confirmWithDevice("Confirm sharing this record");
    if (!confirmed) return;

    setSharing(true);
    const outcome = await shareRecord(visitId);
    setSharing(false);
    if (!outcome.ok) setActionError(outcome.message);
  }

  /**
   * Withdrawing a record, not erasing one.
   *
   * A signed consultation is a medical record: it stays, marked as withdrawn,
   * with the reason attached. Deleting it outright would leave a gap that reads
   * as concealment to anyone who later sees the history — including the vet.
   */
  async function withdrawRecord() {
    setActionError(null);
    if (voidReason.trim().length < 3) {
      setActionError("Say why this record is being withdrawn. It stays on the record.");
      return;
    }
    const confirmed = await confirmWithDevice("Confirm withdrawing this record");
    if (!confirmed) return;

    setVoiding(true);
    const { error: rpcError } = await supabase.rpc("void_visit", {
      p_visit_id: visitId,
      p_reason: voidReason.trim()
    });
    setVoiding(false);
    if (rpcError) {
      setActionError(rpcError.message);
      return;
    }
    await clearDraft(visitId);
    setVoidReason("");
    reload();
  }

  async function markRemainingNormal() {
    setActionError(null);
    const { error: rpcError } = await supabase.rpc("mark_remaining_systems_normal", {
      p_visit_id: visit.id
    });
    if (rpcError) {
      setActionError(rpcError.message);
      return;
    }
    reload();
  }

  async function complete() {
    setSaving(true);
    setActionError(null);
    const { error: rpcError } = await supabase.rpc("complete_visit", { p_visit_id: visit.id });
    setSaving(false);
    if (rpcError) {
      setActionError(rpcError.message);
      return;
    }
    // A signed record is no longer a draft, so nothing about it should remain
    // in the unsaved-typing store.
    await clearDraft(visitId);
    setRestoredAt(null);
    reload();
  }

  return (
    <ScrollScreen>
      <SyncBanner />

      <View style={styles.header}>
        <Avatar name={visit.patients?.name ?? "?"} tone={isDraft ? "brand" : "good"} />
        <View style={styles.headerBody}>
          <Text style={styles.headerName} numberOfLines={1}>
            {visit.patients?.name ?? "Visit"}
          </Text>
          <Text style={styles.headerMeta} numberOfLines={1}>
            {visit.patients?.species}
            {visit.patients?.breed ? ` · ${visit.patients.breed}` : ""}
          </Text>
        </View>
        <View style={[styles.state, isDraft ? styles.stateDraft : styles.stateSigned]}>
          <Ionicons
            name={isDraft ? "create-outline" : "lock-closed"}
            size={12}
            color={isDraft ? palette.brandInk : palette.green}
          />
          <Text style={[styles.stateText, !isDraft && styles.stateTextSigned]}>
            {isDraft ? "Draft" : visit.workflow_status}
          </Text>
        </View>
      </View>
      <View style={styles.codeRow}>
        <CodeChip>{visit.patients?.patient_code ?? "—"}</CodeChip>
      </View>

      {/* Said once, plainly. Announcing a recovery when nothing was lost teaches
          a vet to ignore the message, so it only appears when the restored text
          actually differs from what was last saved. */}
      {restoredAt && differsFrom(draft, draftFromVisit(visit)) ? (
        <Card>
          <Muted>
            Unsaved notes from {new Date(restoredAt).toLocaleString()} were restored. They are on
            this phone only until you press Save.
          </Muted>
        </Card>
      ) : null}

      {findings.length > 0 ? (
        <Card>
          <ProgressBar
            label="Systems examined"
            done={examined}
            total={findings.length}
            tone={abnormal > 0 ? "warn" : examined === findings.length ? "good" : "brand"}
          />
          {abnormal > 0 ? (
            <Muted>
              {abnormal} {abnormal === 1 ? "system is" : "systems are"} abnormal.
            </Muted>
          ) : null}
        </Card>
      ) : null}

      {!isDraft ? (
        <Card>
          <Muted>This record is signed and can no longer be edited.</Muted>
        </Card>
      ) : null}

      {isDraft ? (
        <>
          <Collapsible
            title="History"
            icon="chatbubble-ellipses"
            hint={`${historyFilled} of 4 recorded`}
            initiallyOpen={historyFilled === 0}
          >
            <FieldLabel>Presenting complaint</FieldLabel>
            <Field
              multiline
              value={draft.chiefComplaint}
              onChangeText={(v) => set("chiefComplaint", v)}
            />
            <FieldLabel>History</FieldLabel>
            <Field
              multiline
              value={draft.historyOfComplaint}
              onChangeText={(v) => set("historyOfComplaint", v)}
            />
            <FieldLabel>Past medical history</FieldLabel>
            <Field
              multiline
              value={draft.pastMedicalHistory}
              onChangeText={(v) => set("pastMedicalHistory", v)}
            />
            <FieldLabel>Current medications</FieldLabel>
            <Field
              multiline
              value={draft.currentMedications}
              onChangeText={(v) => set("currentMedications", v)}
            />
          </Collapsible>

          <Collapsible title="Vitals" icon="pulse" hint={`${vitalsFilled} of 6 recorded`}>
            <View style={styles.pairRow}>
              <View style={styles.pairCell}>
                <FieldLabel>Temp °C</FieldLabel>
                <Field
                  keyboardType="decimal-pad"
                  value={draft.temperatureC}
                  onChangeText={(v) => set("temperatureC", v)}
                />
              </View>
              <View style={styles.pairCell}>
                <FieldLabel>Heart bpm</FieldLabel>
                <Field
                  keyboardType="number-pad"
                  value={draft.heartRateBpm}
                  onChangeText={(v) => set("heartRateBpm", v)}
                />
              </View>
            </View>
            <View style={styles.pairRow}>
              <View style={styles.pairCell}>
                <FieldLabel>Resp rate</FieldLabel>
                <Field
                  keyboardType="number-pad"
                  value={draft.respiratoryRateBpm}
                  onChangeText={(v) => set("respiratoryRateBpm", v)}
                />
              </View>
              <View style={styles.pairCell}>
                <FieldLabel>Weight kg</FieldLabel>
                <Field
                  keyboardType="decimal-pad"
                  value={draft.weightValue}
                  onChangeText={(v) => set("weightValue", v)}
                />
              </View>
            </View>
            <View style={styles.pairRow}>
              <View style={styles.pairCell}>
                <FieldLabel>Body condition</FieldLabel>
                <Field
                  value={draft.bodyConditionScore}
                  placeholder="4/9"
                  onChangeText={(v) => set("bodyConditionScore", v)}
                />
              </View>
              <View style={styles.pairCell}>
                <FieldLabel>Pain score</FieldLabel>
                <Field
                  value={draft.painScore}
                  placeholder="2/4"
                  onChangeText={(v) => set("painScore", v)}
                />
              </View>
            </View>
          </Collapsible>
        </>
      ) : (
        <Card>
          <SectionTitle>Signed record</SectionTitle>
          <ReadOnly label="Presenting complaint" value={visit.chief_complaint} />
          <ReadOnly label="History" value={visit.history_of_complaint} />
          <ReadOnly label="Diagnosis" value={visit.definitive_diagnosis} />
          <ReadOnly label="Treatment" value={visit.treatment_plan} />
          <ReadOnly label="Prescriptions" value={visit.prescriptions} />
          <ReadOnly label="Home care" value={visit.follow_up_plan} />
        </Card>
      )}

      <Collapsible
        title="Examination"
        icon="body"
        hint={
          notExamined === 0
            ? `All ${findings.length} examined`
            : `${notExamined} still not examined`
        }
        tone={notExamined === 0 ? "good" : "warn"}
      >
        <Muted>
          Every system starts unexamined. Marking one normal says you looked and found nothing
          wrong.
        </Muted>
        {findings.map((finding) => (
          <ExamRow
            key={finding.id}
            finding={finding}
            editable={isDraft}
            onChange={(next, remarks) =>
              void setFinding(finding.system_name, next, remarks, finding.server_version)
            }
          />
        ))}
        {isDraft && notExamined > 0 ? (
          <SecondaryButton
            label={`Mark the ${notExamined} remaining normal`}
            onPress={() => void markRemainingNormal()}
          />
        ) : null}
      </Collapsible>

      {isDraft ? (
        <Collapsible
          title="Assessment and plan"
          icon="clipboard"
          hint={`${planFilled} of 8 recorded`}
        >
          <FieldLabel>Problem list</FieldLabel>
          <Field multiline value={draft.problemList} onChangeText={(v) => set("problemList", v)} />
          <FieldLabel>Differentials</FieldLabel>
          <Field
            multiline
            value={draft.differentialDiagnoses}
            onChangeText={(v) => set("differentialDiagnoses", v)}
          />
          <FieldLabel>Tentative diagnosis</FieldLabel>
          <Field
            multiline
            value={draft.tentativeDiagnosis}
            onChangeText={(v) => set("tentativeDiagnosis", v)}
          />
          <FieldLabel>Diagnosis</FieldLabel>
          <Field
            multiline
            value={draft.definitiveDiagnosis}
            onChangeText={(v) => set("definitiveDiagnosis", v)}
          />
          <FieldLabel>Treatment</FieldLabel>
          <Field
            multiline
            value={draft.treatmentPlan}
            onChangeText={(v) => set("treatmentPlan", v)}
          />
          <FieldLabel>Prescriptions</FieldLabel>
          <Field
            multiline
            value={draft.prescriptions}
            onChangeText={(v) => set("prescriptions", v)}
          />
          <FieldLabel>Home care and follow-up</FieldLabel>
          <Field
            multiline
            value={draft.followUpPlan}
            onChangeText={(v) => set("followUpPlan", v)}
          />
          <FieldLabel>Next review date</FieldLabel>
          <Field
            value={draft.nextReviewDate}
            placeholder="2026-08-09"
            onChangeText={(v) => set("nextReviewDate", v)}
          />
        </Collapsible>
      ) : null}

      <TreatmentsSection
        visitId={visit.id}
        species={visit.patients?.species ?? "other"}
        purpose={visit.patients?.purpose ?? "pet"}
        isGroup={visit.patients?.kind === "group"}
        editable={isDraft}
      />

      <AttachmentsSection visitId={visit.id} patientId={visit.patient_id} editable={isDraft} />

      <StockSection
        visitId={visit.id}
        editable={isDraft}
        batches={batches}
        consumed={consumed}
        onRecorded={reload}
      />

      {isDraft ? (
        <Card>
          {/* Save lives out here rather than inside a section. The sections
              collapse, and a save button that can be hidden is a save button
              that will be missed. */}
          {actionError ? <ErrorText>{actionError}</ErrorText> : null}
          {status ? <Body>{status}</Body> : null}
          <PrimaryButton
            label={saving ? "Saving…" : "Save"}
            disabled={saving}
            onPress={() => void saveDraft()}
          />
          <Muted>Completing signs the record. After that it cannot be edited, only amended.</Muted>
          <SecondaryButton
            label={saving ? "Signing…" : "Complete and sign"}
            onPress={() => void complete()}
          />
        </Card>
      ) : (
        <Card>
          {actionError ? <ErrorText>{actionError}</ErrorText> : null}
          <SecondaryButton
            label="Back to the folder"
            onPress={() =>
              router.replace({
                pathname: "/practice/patient/[id]",
                params: { id: visit.patient_id }
              })
            }
          />
        </Card>
      )}

      {/* Only a signed record leaves the app. A draft handed to a client reads
          as settled when it is not, and the database refuses it anyway. */}
      {visit.workflow_status === "completed" ? (
        <Card>
          <FieldLabel>Give the client a copy</FieldLabel>
          <Muted>
            A PDF of this consultation, made on this phone, so it works with no signal. Sharing is
            recorded against the record.
          </Muted>
          <PrimaryButton
            label={sharing ? "Preparing…" : "Share this record"}
            disabled={sharing}
            onPress={() => void giveClientACopy()}
          />
        </Card>
      ) : null}

      {visit.workflow_status !== "voided" ? (
        <Collapsible title="Withdraw this record" icon="close-circle" tone="bad">
          <Muted>
            The record stays in the folder, marked as withdrawn, with your reason attached. It is
            not deleted: a gap in a clinical history reads as concealment, and a withdrawn record
            that is visible is worth more than one that vanished.
          </Muted>
          <FieldLabel>Why</FieldLabel>
          <Field
            value={voidReason}
            onChangeText={setVoidReason}
            placeholder="Recorded against the wrong animal, duplicate entry"
          />
          <SecondaryButton
            label={voiding ? "Withdrawing…" : "Withdraw record"}
            onPress={() => void withdrawRecord()}
          />
        </Collapsible>
      ) : null}
    </ScrollScreen>
  );
}

function ReadOnly({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.readOnly}>
      <FieldLabel>{label}</FieldLabel>
      <Body>{value}</Body>
    </View>
  );
}

const EXAM_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  normal: "checkmark-circle",
  abnormal: "alert-circle",
  not_applicable: "remove-circle",
  not_examined: "ellipse-outline"
};

const EXAM_COLOR: Record<string, string> = {
  normal: palette.green,
  abnormal: palette.amber,
  not_applicable: palette.quiet,
  not_examined: palette.line
};

function ExamRow({
  finding,
  editable,
  onChange
}: {
  finding: ExamFinding;
  editable: boolean;
  onChange: (status: string, remarks: string | null) => void;
}) {
  const [remarks, setRemarks] = useState(finding.remarks ?? "");

  return (
    <View style={[styles.examRow, finding.status === "abnormal" && styles.examAbnormal]}>
      <View style={styles.examHead}>
        {/* An icon as well as the colour, so the state survives sunlight and a
            colourblind reader. */}
        <Ionicons
          name={EXAM_ICON[finding.status] ?? "ellipse-outline"}
          size={18}
          color={EXAM_COLOR[finding.status] ?? palette.quiet}
        />
        <Text style={styles.examSystem}>{finding.system_name}</Text>
        {!editable ? (
          <Text style={styles.examStatusText}>{finding.status.replace("_", " ")}</Text>
        ) : null}
      </View>
      {editable ? (
        <>
          <Segmented
            accessibilityLabel={`${finding.system_name} status`}
            options={EXAM_OPTIONS}
            value={finding.status}
            onChange={(next) => onChange(next, remarks)}
          />
          <Field
            value={remarks}
            placeholder="Remarks"
            onChangeText={setRemarks}
            onBlur={() => {
              if (remarks !== (finding.remarks ?? "")) onChange(finding.status, remarks);
            }}
          />
        </>
      ) : finding.remarks ? (
        <Muted>{finding.remarks}</Muted>
      ) : null}
    </View>
  );
}

function StockSection({
  visitId,
  editable,
  batches,
  consumed,
  onRecorded
}: {
  visitId: string;
  editable: boolean;
  batches: UsableBatch[];
  consumed: ConsumedMovement[];
  onRecorded: () => void;
}) {
  const [batchId, setBatchId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = batches.find((b) => b.id === batchId) ?? null;

  async function record() {
    if (!selected) {
      setError("Choose which batch you took it from.");
      return;
    }
    const amount = Number(quantity.trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter how much you used.");
      return;
    }
    if (amount > Number(selected.quantity_on_hand)) {
      setError(
        `Only ${selected.quantity_on_hand} ${selected.inventory_items?.unit ?? ""} left in that batch.`
      );
      return;
    }

    setBusy(true);
    setError(null);
    // The movement id is minted here, so a retried sync deducts the stock once.
    const { error: rpcError } = await supabase.rpc("record_inventory_consumption", {
      p_movement_id: globalThis.crypto.randomUUID(),
      p_batch_id: selected.id,
      p_visit_id: visitId,
      p_quantity: amount
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setQuantity("");
    setBatchId(null);
    onRecorded();
  }

  return (
    <Collapsible
      title="Stock used"
      icon="cube"
      hint={consumed.length === 0 ? "Nothing taken" : `${consumed.length} recorded`}
    >
      {consumed.length === 0 ? (
        <Muted>Nothing taken from the vehicle for this visit.</Muted>
      ) : (
        consumed.map((movement) => (
          <View key={movement.id} style={styles.usedRow}>
            <Text style={styles.usedName}>
              {movement.inventory_batches?.inventory_items?.item_name ?? "Item"}
            </Text>
            <Text style={styles.usedQty}>
              {Math.abs(Number(movement.quantity))}{" "}
              {movement.inventory_batches?.inventory_items?.unit ?? ""}
            </Text>
          </View>
        ))
      )}

      {editable ? (
        batches.length === 0 ? (
          <Muted>
            No usable stock on hand. Expired batches are never offered, even when still in the
            vehicle.
          </Muted>
        ) : (
          <>
            <FieldLabel>Batch</FieldLabel>
            {/* Selection reads as a chosen row, not as a list of buttons all
                shouting equally. */}
            {batches.map((batch) => {
              const chosen = batch.id === batchId;
              return (
                <Pressable
                  key={batch.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: chosen }}
                  style={({ pressed }) => [
                    styles.batchRow,
                    chosen && styles.batchChosen,
                    pressed && styles.batchPressed
                  ]}
                  onPress={() => setBatchId(batch.id)}
                >
                  <Ionicons
                    name={chosen ? "radio-button-on" : "radio-button-off"}
                    size={18}
                    color={chosen ? palette.brand : palette.quiet}
                  />
                  <View style={styles.batchBody}>
                    <Text style={styles.batchName}>
                      {batch.inventory_items?.item_name ?? "Item"}
                    </Text>
                    <Text style={styles.batchMeta}>
                      {batch.batch_lot_number ? `${batch.batch_lot_number} · ` : ""}
                      {batch.quantity_on_hand} {batch.inventory_items?.unit ?? ""} left
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            <FieldLabel>Quantity used</FieldLabel>
            <Field keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} />
            {error ? <ErrorText>{error}</ErrorText> : null}
            <PrimaryButton
              label={busy ? "Recording…" : "Record stock used"}
              disabled={busy}
              onPress={() => void record()}
            />
          </>
        )
      ) : null}
    </Collapsible>
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
  codeRow: { paddingHorizontal: space.xs, flexDirection: "row" },
  state: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    borderRadius: radiusPill,
    paddingHorizontal: space.md,
    paddingVertical: 4
  },
  stateDraft: { backgroundColor: palette.brandSoft },
  stateSigned: { backgroundColor: palette.greenSoft },
  stateText: { fontFamily: fonts.semibold, fontSize: 11, color: palette.brandInk },
  stateTextSigned: { color: palette.green },
  pairRow: { flexDirection: "row", gap: space.md },
  pairCell: { flex: 1, gap: space.xs },
  readOnly: { gap: space.xs },
  examRow: {
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radiusControl,
    backgroundColor: palette.ground
  },
  // Abnormal carries a heavier border and a label, never colour on its own.
  examAbnormal: {
    borderLeftWidth: 4,
    borderLeftColor: palette.amber,
    backgroundColor: palette.amberSoft
  },
  examHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  examSystem: { ...type.strong, fontSize: 15, color: palette.ink, flex: 1 },
  examStatusText: { fontFamily: fonts.medium, fontSize: 12, color: palette.quiet },
  usedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingVertical: space.sm
  },
  usedName: { ...type.strong, fontSize: 15, color: palette.ink, flex: 1 },
  usedQty: { fontFamily: fonts.mono, fontSize: 13, color: palette.quiet },
  batchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radiusControl,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface
  },
  batchChosen: { borderColor: palette.brand, backgroundColor: palette.brandSoft },
  batchPressed: { opacity: 0.7 },
  batchBody: { flex: 1, gap: 1 },
  batchName: { ...type.strong, fontSize: 15, color: palette.ink },
  batchMeta: { ...type.small, fontSize: 12, color: palette.quiet }
});
