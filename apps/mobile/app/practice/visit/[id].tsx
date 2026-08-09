import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { definedArgs, optionalNumber, optionalText } from "@vetkeep/contracts";
import { supabase } from "@/lib/supabase";
import { useSync } from "@/sync/sync-provider";
import { SyncBanner } from "@/sync/sync-banner";
import { AttachmentsSection } from "@/features/practice/attachments-section";
import { useQuery } from "@/features/practice/use-query";
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
  Pill,
  ScrollScreen,
  SectionTitle,
  Segmented,
  palette
} from "@/ui/practice-components";
import { radiusControl } from "@/ui/tokens";

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

export default function VisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { record } = useSync();
  const [draft, setDraft] = useState<DraftForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, error, loading, reload } = useQuery<Loaded>(async () => {
    const visitId = String(id);
    const today = new Date().toISOString().slice(0, 10);

    const [visitResult, findingsResult, batchesResult, movementsResult] = await Promise.all([
      supabase
        .from("visits")
        .select("*, patients(name, species, breed, patient_code)")
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
    setDraft((current) => current ?? draftFromVisit(visit));

    return {
      visit,
      findings: (findingsResult.data ?? []) as ExamFinding[],
      batches: (batchesResult.data ?? []) as unknown as UsableBatch[],
      consumed: (movementsResult.data ?? []) as unknown as ConsumedMovement[]
    };
  }, [id]);

  if (loading && !data) {
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

  const set = (key: keyof DraftForm, value: string) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

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
    reload();
  }

  return (
    <ScrollScreen>
      <SyncBanner />
      <Card>
        <View style={styles.headRow}>
          <SectionTitle>{visit.patients?.name ?? "Visit"}</SectionTitle>
          <Pill
            label={visit.workflow_status}
            tone={
              visit.workflow_status === "completed"
                ? "good"
                : visit.workflow_status === "voided"
                  ? "bad"
                  : "neutral"
            }
          />
        </View>
        <Muted>
          {visit.patients?.species}
          {visit.patients?.breed ? ` · ${visit.patients.breed}` : ""} ·{" "}
          {visit.patients?.patient_code}
        </Muted>
        {!isDraft ? <Muted>This record is signed and can no longer be edited.</Muted> : null}
      </Card>

      {isDraft ? (
        <>
          <Card>
            <SectionTitle>Consultation</SectionTitle>
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
          </Card>

          <Card>
            <SectionTitle>Vitals</SectionTitle>
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
          </Card>

          <Card>
            <SectionTitle>Assessment and plan</SectionTitle>
            <FieldLabel>Problem list</FieldLabel>
            <Field
              multiline
              value={draft.problemList}
              onChangeText={(v) => set("problemList", v)}
            />
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
            {actionError ? <ErrorText>{actionError}</ErrorText> : null}
            {status ? <Body>{status}</Body> : null}
            <PrimaryButton
              label={saving ? "Saving…" : "Save"}
              disabled={saving}
              onPress={() => void saveDraft()}
            />
          </Card>
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

      <Card>
        <SectionTitle>Examination</SectionTitle>
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
      </Card>

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
          <SectionTitle>Finish</SectionTitle>
          <Muted>Completing signs the record. After that it cannot be edited, only amended.</Muted>
          {actionError ? <ErrorText>{actionError}</ErrorText> : null}
          <PrimaryButton
            label={saving ? "Signing…" : "Complete and sign"}
            disabled={saving}
            onPress={() => void complete()}
          />
        </Card>
      ) : (
        <Card>
          <SecondaryButton
            label="Back to today"
            onPress={() => router.replace("/practice/today")}
          />
        </Card>
      )}
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
    <View
      style={[
        styles.examRow,
        finding.status === "abnormal" && styles.examAbnormal,
        finding.status === "not_examined" && styles.examPending
      ]}
    >
      <View style={styles.headRow}>
        <Text style={styles.examSystem}>{finding.system_name}</Text>
        {!editable ? (
          <Pill
            label={finding.status.replace("_", " ")}
            tone={finding.status === "abnormal" ? "warn" : "neutral"}
          />
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
    <Card>
      <SectionTitle>Stock used</SectionTitle>
      {consumed.length === 0 ? (
        <Muted>Nothing taken from the vehicle for this visit.</Muted>
      ) : (
        consumed.map((movement) => (
          <View key={movement.id} style={styles.headRow}>
            <Text style={styles.examSystem}>
              {movement.inventory_batches?.inventory_items?.item_name ?? "Item"}
            </Text>
            <Muted>
              {Math.abs(Number(movement.quantity))}{" "}
              {movement.inventory_batches?.inventory_items?.unit ?? ""}
            </Muted>
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
            {batches.map((batch) => (
              <SecondaryButton
                key={batch.id}
                label={`${batch.inventory_items?.item_name ?? "Item"}${
                  batch.batch_lot_number ? ` · ${batch.batch_lot_number}` : ""
                } — ${batch.quantity_on_hand} ${batch.inventory_items?.unit ?? ""} left${
                  batch.id === batchId ? "  ✓" : ""
                }`}
                onPress={() => setBatchId(batch.id)}
              />
            ))}
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
    </Card>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  pairRow: { flexDirection: "row", gap: 10 },
  pairCell: { flex: 1, gap: 4 },
  readOnly: { gap: 2 },
  examRow: {
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radiusControl,

    borderLeftWidth: 3,
    borderLeftColor: palette.line,
    backgroundColor: palette.ground
  },
  // Abnormal carries a heavier border and a label, never colour on its own.
  examAbnormal: {
    borderLeftColor: palette.amber,
    borderLeftWidth: 5,
    backgroundColor: palette.amberSoft
  },
  examPending: { borderLeftColor: palette.line, borderStyle: "dashed" },
  examSystem: { fontSize: 15, fontWeight: "700", color: palette.ink }
});
