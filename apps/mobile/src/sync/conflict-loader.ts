import {
  CLIENT_FIELDS,
  EXAM_FINDING_FIELDS,
  PATIENT_FIELDS,
  VISIT_DRAFT_FIELDS,
  diffFields,
  type EntityType,
  type FieldConflict,
  type OutboundMutation
} from "@vetkeep/sync";
import { supabase } from "@/lib/supabase";

/**
 * Loads the server side of a conflict so the vet can compare it against what
 * this phone holds.
 */

const FIELD_SPECS: Partial<Record<EntityType, typeof VISIT_DRAFT_FIELDS>> = {
  visit_draft: VISIT_DRAFT_FIELDS,
  exam_finding: EXAM_FINDING_FIELDS,
  client: CLIENT_FIELDS,
  patient: PATIENT_FIELDS
};

const TABLES: Partial<Record<EntityType, string>> = {
  visit_draft: "visits",
  exam_finding: "physical_exam_findings",
  client: "clients",
  patient: "patients"
};

export interface LoadedConflict {
  mutation: OutboundMutation;
  serverRow: Record<string, unknown>;
  conflicts: FieldConflict[];
  /** Brief 15.6 requires the vet be told when and from where the other edit came. */
  serverUpdatedAt: string | null;
  serverDeviceName: string | null;
  serverVersion: number | null;
}

export async function loadConflict(mutation: OutboundMutation): Promise<LoadedConflict | null> {
  const table = TABLES[mutation.entityType];
  const fields = FIELD_SPECS[mutation.entityType];
  if (!table || !fields) return null;

  // An examination finding is addressed by visit and system rather than by its
  // own id, because the mutation carries the visit it belongs to.
  const query = supabase.from(table as never).select("*");
  const scoped =
    mutation.entityType === "exam_finding"
      ? query
          .eq("visit_id", mutation.entityId)
          .eq("system_name", String(mutation.payload.p_system_name ?? ""))
      : query.eq("id", mutation.entityId);

  const { data, error } = await scoped.maybeSingle();
  if (error || !data) return null;

  const serverRow = data as unknown as Record<string, unknown>;
  const deviceId = serverRow.last_modified_by_device_id;

  let serverDeviceName: string | null = null;
  if (typeof deviceId === "string") {
    const { data: device } = await supabase
      .from("vet_devices")
      .select("device_name")
      .eq("id", deviceId)
      .maybeSingle();
    serverDeviceName = device?.device_name ?? null;
  }

  return {
    mutation,
    serverRow,
    conflicts: diffFields(mutation.payload, serverRow, fields),
    serverUpdatedAt: typeof serverRow.updated_at === "string" ? serverRow.updated_at : null,
    serverDeviceName,
    serverVersion: typeof serverRow.server_version === "number" ? serverRow.server_version : null
  };
}

/** What the vet calls the thing they are resolving. */
export function describeEntity(mutation: OutboundMutation): string {
  switch (mutation.entityType) {
    case "visit_draft":
      return "Consultation";
    case "exam_finding":
      return `Examination — ${String(mutation.payload.p_system_name ?? "system")}`;
    case "client":
      return "Client details";
    case "patient":
      return "Animal details";
    default:
      return mutation.entityType.replace("_", " ");
  }
}
