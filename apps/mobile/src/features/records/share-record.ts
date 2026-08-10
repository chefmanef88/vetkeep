import type * as PrintNamespace from "expo-print";
import type * as SharingNamespace from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { supabase } from "@/lib/supabase";
import { speciesProfile } from "@vetkeep/domain";
import {
  buildFolderDocument,
  buildRecordDocument,
  documentFileName,
  folderFileName,
  type DocumentClient,
  type DocumentFolder,
  type DocumentRecord,
  type DocumentVet
} from "./record-document";

/**
 * Hands the owner a copy of clinical records (brief §10.6), either one signed
 * consultation or the folder's whole history.
 *
 * Generated on the device. A vet standing on a farm with no signal must still
 * be able to give the farmer the paperwork, so nothing here needs the server
 * except the audit at the end.
 */

export type ShareOutcome = { ok: true } | { ok: false; message: string };

// Type-only, so these are erased at compile time and no native module is
// required merely by opening a screen that imports this file.
type PrintModule = typeof PrintNamespace;
type SharingModule = typeof SharingNamespace;

/**
 * expo-print and expo-sharing are native modules, so they exist only in a build
 * made after they were added. Loaded on demand rather than at import time: a
 * development client from before that build must still open a consultation and
 * let the vet work, and lose only the ability to hand over a PDF.
 */
async function loadPrinting(): Promise<
  { ok: true; print: PrintModule; sharing: SharingModule } | { ok: false; message: string }
> {
  try {
    const [print, sharing] = await Promise.all([import("expo-print"), import("expo-sharing")]);
    // Touch the function that needs the native side, so a missing module fails
    // here with a message rather than mid-share with a stack trace.
    if (typeof print.printToFileAsync !== "function") throw new Error("no printer");
    return { ok: true, print, sharing };
  } catch {
    return {
      ok: false,
      message:
        "Sharing needs a newer build of the app. Everything else works; install the next build to hand out records."
    };
  }
}

const VISIT_COLUMNS =
  "id, patient_id, visit_date, visit_type, workflow_status, chief_complaint, history_of_complaint, temperature_c, heart_rate_bpm, respiratory_rate_bpm, weight_value, weight_unit, definitive_diagnosis, tentative_diagnosis, treatment_plan, prescriptions, follow_up_plan, next_review_date";

type VisitRow = {
  id: string;
  patient_id: string;
  visit_date: string;
  visit_type: string;
  workflow_status: string;
  chief_complaint: string | null;
  history_of_complaint: string | null;
  temperature_c: number | null;
  heart_rate_bpm: number | null;
  respiratory_rate_bpm: number | null;
  weight_value: number | null;
  weight_unit: string;
  definitive_diagnosis: string | null;
  tentative_diagnosis: string | null;
  treatment_plan: string | null;
  prescriptions: string | null;
  follow_up_plan: string | null;
  next_review_date: string | null;
};

function toDocumentRecord(
  visit: VisitRow,
  abnormalFindings: { systemName: string; remarks: string | null }[]
): DocumentRecord {
  return {
    visitDate: visit.visit_date,
    visitType: visit.visit_type,
    workflowStatus: visit.workflow_status,
    chiefComplaint: visit.chief_complaint,
    historyOfComplaint: visit.history_of_complaint,
    temperatureC: visit.temperature_c === null ? null : String(visit.temperature_c),
    heartRateBpm: visit.heart_rate_bpm === null ? null : String(visit.heart_rate_bpm),
    respiratoryRateBpm:
      visit.respiratory_rate_bpm === null ? null : String(visit.respiratory_rate_bpm),
    weightValue: visit.weight_value === null ? null : String(visit.weight_value),
    weightUnit: visit.weight_unit,
    definitiveDiagnosis: visit.definitive_diagnosis,
    tentativeDiagnosis: visit.tentative_diagnosis,
    treatmentPlan: visit.treatment_plan,
    prescriptions: visit.prescriptions,
    followUpPlan: visit.follow_up_plan,
    nextReviewDate: visit.next_review_date,
    abnormalFindings
  };
}

/**
 * The animal's photograph as inline bytes.
 *
 * Downloaded and encoded rather than linked: the bucket is private and a signed
 * URL expires, so a document carrying a link would show the owner a broken
 * image a week later. Returns null on any failure — a missing picture is a
 * cosmetic loss, and it must never be the reason a farmer leaves without
 * paperwork.
 */
async function loadPhotoDataUri(attachmentId: string | null): Promise<string | null> {
  if (!attachmentId) return null;
  try {
    const { data: attachment } = await supabase
      .from("attachments")
      .select("storage_bucket, storage_path, mime_type, upload_status")
      .eq("id", attachmentId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!attachment || attachment.upload_status !== "uploaded") return null;

    const { data: blob } = await supabase.storage
      .from(attachment.storage_bucket)
      .download(attachment.storage_path);
    if (!blob) return null;

    const base64 = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve(null);
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.readAsDataURL(blob);
    });

    // readAsDataURL already produces "data:<mime>;base64,…".
    return base64 && base64.startsWith("data:image/") ? base64 : null;
  } catch {
    return null;
  }
}

/** The practice, the owner and the animal: the same header on both documents. */
async function loadContext(
  patientId: string
): Promise<
  | { ok: true; vet: DocumentVet; client: DocumentClient; folder: DocumentFolder }
  | { ok: false; message: string }
> {
  const [vetResult, patientResult, ownerResult] = await Promise.all([
    supabase
      .from("vets")
      .select("full_name, business_name, license_number, license_verified, phone_display")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("patients")
      .select(
        "name, patient_code, species, kind, purpose, breed, sex, head_count, microchip_id, ear_tag, leg_ring, profile_photo_attachment_id"
      )
      .eq("id", patientId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("patient_owners")
      .select("clients(name, client_code, phone_display)")
      .eq("patient_id", patientId)
      .is("deleted_at", null)
      .is("valid_to", null)
      .limit(1)
      .maybeSingle()
  ]);

  const vet = vetResult.data;
  const patient = patientResult.data;
  if (!vet || !patient) return { ok: false, message: "Could not load the practice details." };

  const owner = ownerResult.data?.clients as
    { name: string; client_code: string; phone_display: string } | null | undefined;

  const profile = speciesProfile(patient.species);
  const identifier = patient.microchip_id ?? patient.ear_tag ?? patient.leg_ring ?? null;
  const photoDataUri = await loadPhotoDataUri(patient.profile_photo_attachment_id);

  return {
    ok: true,
    vet: {
      fullName: vet.full_name,
      businessName: vet.business_name,
      licenseNumber: vet.license_number,
      licenseVerified: vet.license_verified,
      phoneDisplay: vet.phone_display
    },
    client: {
      name: owner?.name ?? "Owner not recorded",
      clientCode: owner?.client_code ?? "—",
      phoneDisplay: owner?.phone_display ?? ""
    },
    folder: {
      name: patient.name,
      patientCode: patient.patient_code,
      species: profile.label,
      kind: patient.kind,
      purpose: patient.purpose,
      breed: patient.breed,
      sex: patient.sex,
      headCount: patient.head_count,
      identifier,
      identifierLabel: patient.microchip_id
        ? "Microchip"
        : patient.ear_tag
          ? "Ear tag"
          : patient.leg_ring
            ? "Leg ring"
            : null,
      photoDataUri
    }
  };
}

/** Render, rename to something findable, and hand to the system share sheet. */
async function renderAndShare(
  html: string,
  fileName: string,
  dialogTitle: string
): Promise<ShareOutcome> {
  const printing = await loadPrinting();
  if (!printing.ok) return printing;

  let uri: string;
  try {
    const printed = await printing.print.printToFileAsync({ html });
    uri = printed.uri;
  } catch {
    return { ok: false, message: "Could not produce the document on this device." };
  }

  // expo-print names the file randomly. What lands in the client's WhatsApp
  // should still be identifiable a year later.
  try {
    const generated = new File(uri);
    const target = new File(Paths.cache, fileName);
    if (target.exists) target.delete();
    generated.move(target);
    uri = target.uri;
  } catch {
    // Keep the generated name rather than failing the share over cosmetics.
  }

  if (!(await printing.sharing.isAvailableAsync())) {
    return { ok: false, message: "This device cannot share files." };
  }

  await printing.sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle,
    UTI: "com.adobe.pdf"
  });

  return { ok: true };
}

export async function shareRecord(visitId: string): Promise<ShareOutcome> {
  const { data: visit, error: visitError } = await supabase
    .from("visits")
    .select(VISIT_COLUMNS)
    .eq("id", visitId)
    .is("deleted_at", null)
    .maybeSingle<VisitRow>();

  if (visitError || !visit) return { ok: false, message: "Could not load this record." };

  // Guarded here as well as in the interface and the database. A draft handed
  // to a client reads as settled when it is not.
  if (visit.workflow_status === "draft") {
    return { ok: false, message: "Sign the record before giving it to the client." };
  }

  const [context, findingsResult] = await Promise.all([
    loadContext(visit.patient_id),
    supabase
      .from("physical_exam_findings")
      .select("system_name, remarks")
      .eq("visit_id", visitId)
      .eq("status", "abnormal")
      .order("system_name", { ascending: true })
  ]);
  if (!context.ok) return context;

  const record = toDocumentRecord(
    visit,
    (findingsResult.data ?? []).map((finding) => ({
      systemName: finding.system_name,
      remarks: finding.remarks
    }))
  );

  const html = buildRecordDocument({
    vet: context.vet,
    client: context.client,
    folder: context.folder,
    record,
    generatedAt: new Date()
  });

  const outcome = await renderAndShare(
    html,
    documentFileName(context.folder, record),
    `${context.folder.name} — consultation record`
  );
  if (!outcome.ok) return outcome;

  return auditDisclosure(visit.patient_id, "single_record", visitId);
}

export async function shareFolder(patientId: string): Promise<ShareOutcome> {
  const [context, visitsResult] = await Promise.all([
    loadContext(patientId),
    supabase
      .from("visits")
      .select(VISIT_COLUMNS)
      .eq("patient_id", patientId)
      .is("deleted_at", null)
      // Drafts are unfinished and are not part of a history handed to anyone.
      .neq("workflow_status", "draft")
      .order("visit_date", { ascending: false })
      .returns<VisitRow[]>()
  ]);
  if (!context.ok) return context;

  const visits = visitsResult.data ?? [];
  if (visits.length === 0) {
    return { ok: false, message: "There are no signed records in this folder yet." };
  }

  // One query for every record's abnormal findings rather than one per record,
  // because a long history on a slow connection would otherwise crawl.
  const { data: findings } = await supabase
    .from("physical_exam_findings")
    .select("visit_id, system_name, remarks")
    .in(
      "visit_id",
      visits.map((visit) => visit.id)
    )
    .eq("status", "abnormal")
    .order("system_name", { ascending: true });

  const byVisit = new Map<string, { systemName: string; remarks: string | null }[]>();
  for (const finding of findings ?? []) {
    const list = byVisit.get(finding.visit_id) ?? [];
    list.push({ systemName: finding.system_name, remarks: finding.remarks });
    byVisit.set(finding.visit_id, list);
  }

  const generatedAt = new Date();
  const html = buildFolderDocument({
    vet: context.vet,
    client: context.client,
    folder: context.folder,
    records: visits.map((visit) => toDocumentRecord(visit, byVisit.get(visit.id) ?? [])),
    generatedAt
  });

  const outcome = await renderAndShare(
    html,
    folderFileName(context.folder, generatedAt),
    `${context.folder.name} — full history`
  );
  if (!outcome.ok) return outcome;

  return auditDisclosure(patientId, "full_history", null);
}

/**
 * The fact and the moment, never the document and never a recipient: the share
 * sheet does not tell us where it went, and recording a guess would be worse
 * than recording nothing.
 */
async function auditDisclosure(
  patientId: string,
  scope: "single_record" | "full_history",
  visitId: string | null
): Promise<ShareOutcome> {
  const { error } = await supabase.rpc("record_record_disclosure", {
    p_patient_id: patientId,
    p_scope: scope,
    ...(visitId ? { p_visit_id: visitId } : {})
  });
  if (error) {
    return { ok: false, message: `Shared, but the disclosure was not recorded: ${error.message}` };
  }
  return { ok: true };
}
