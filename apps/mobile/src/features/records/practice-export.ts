import type * as SharingNamespace from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { supabase } from "@/lib/supabase";

/**
 * A complete copy of a practice (brief §17.1).
 *
 * This is the thing that makes account closure survivable. Without it a
 * veterinarian who closes keeps nothing, which is the wrong shape for a product
 * whose whole claim is that the record belongs to the person who wrote it.
 *
 * The file is JSON rather than PDF on purpose. A per-record PDF already exists
 * for handing to a client, and it is the right format for a document a person
 * reads. This is a different job: it is the practice's data, meant to be
 * imported by whatever comes next, and a PDF of four hundred consultations is
 * something nobody can do anything with.
 *
 * Attachments are listed rather than embedded. The files stay in storage and
 * each carries the path it lives at, so they can be fetched with the same
 * short-lived signed URLs the application already uses to show an animal's
 * photograph.
 */

type SharingModule = typeof SharingNamespace;

export type ExportCounts = {
  clients: number;
  patients: number;
  visits: number;
  treatments: number;
  preventive_care: number;
  invoices: number;
  attachments: number;
};

export type ExportResult =
  { ok: true; counts: ExportCounts; fileName: string } | { ok: false; message: string };

/**
 * expo-sharing is native, so it exists only in a build made after it was added.
 * Loaded on demand: an older development client should still open this screen
 * and say something useful rather than crashing on import.
 */
async function loadSharing(): Promise<
  { ok: true; sharing: SharingModule } | { ok: false; message: string }
> {
  try {
    const sharing = await import("expo-sharing");
    if (typeof sharing.shareAsync !== "function") throw new Error("no sharing");
    return { ok: true, sharing };
  } catch {
    return {
      ok: false,
      message:
        "Saving a copy needs a newer build of the app. Install the next build before closing your account."
    };
  }
}

function fileNameFor(now: Date): string {
  // Sortable and unambiguous: these files end up in a downloads folder beside
  // whatever else the vet has saved, possibly years later.
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `vetkeep-practice-export-${stamp}.json`;
}

/**
 * Requests, builds, writes and shares the export, then records that it left.
 *
 * Generation and download are separate audit events because they are different
 * facts: one says a copy was made, the other says it reached a device. Only the
 * second is a disclosure.
 */
export async function exportPractice(): Promise<ExportResult> {
  const sharingModule = await loadSharing();
  if (!sharingModule.ok) return sharingModule;

  const jobId = globalThis.crypto.randomUUID();

  const { error: jobError } = await supabase.rpc("create_export_job", { p_id: jobId });
  if (jobError) return { ok: false, message: jobError.message };

  const { data, error: buildError } = await supabase.rpc("build_practice_export", {
    p_job_id: jobId
  });
  if (buildError) return { ok: false, message: buildError.message };
  if (!data) return { ok: false, message: "The export came back empty. Nothing was saved." };

  const now = new Date();
  const fileName = fileNameFor(now);
  let uri: string;

  try {
    const target = new File(Paths.cache, fileName);
    if (target.exists) target.delete();
    target.create();
    target.write(JSON.stringify(data, null, 2));
    uri = target.uri;
  } catch (reason) {
    return {
      ok: false,
      message: reason instanceof Error ? reason.message : "The export could not be written."
    };
  }

  if (!(await sharingModule.sharing.isAvailableAsync())) {
    return { ok: false, message: "This device cannot share files." };
  }

  await sharingModule.sharing.shareAsync(uri, {
    mimeType: "application/json",
    dialogTitle: "Save your practice export",
    UTI: "public.json"
  });

  // After the share sheet, not before. Marking it downloaded while the sheet is
  // still open would record a disclosure that the vet may have cancelled.
  await supabase.rpc("mark_export_downloaded", { p_job_id: jobId });

  const counts = (data as { attachment_manifest?: unknown[] } & Record<string, unknown>) ?? {};
  return {
    ok: true,
    fileName,
    counts: {
      clients: countOf(counts, "clients"),
      patients: countOf(counts, "patients"),
      visits: countOf(counts, "visits"),
      treatments: countOf(counts, "treatments"),
      preventive_care: countOf(counts, "preventive_care"),
      invoices: countOf(counts, "invoices"),
      attachments: countOf(counts, "attachment_manifest")
    }
  };
}

function countOf(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  return Array.isArray(value) ? value.length : 0;
}
