import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Creating an invoice needs no form: the client is derived from the visit's
 * patient, and the number is sequential within the account. This route creates
 * it and sends the vet straight to the invoice.
 */
export default async function NewInvoicePage({
  searchParams
}: {
  searchParams: Promise<{ visitId?: string; patientId?: string }>;
}) {
  const { visitId, patientId } = await searchParams;
  if (!visitId || !patientId) notFound();

  const supabase = await createClient();

  const { data: ownership } = await supabase
    .from("patient_owners")
    .select("client_id")
    .eq("patient_id", patientId)
    .is("deleted_at", null)
    .is("valid_to", null)
    .eq("is_primary", true)
    .maybeSingle();

  if (!ownership?.client_id) {
    throw new Error("This animal has no current owner, so there is nobody to invoice.");
  }

  const { count } = await supabase
    .from("visit_invoices")
    .select("id", { count: "exact", head: true });

  const invoiceId = crypto.randomUUID();
  const invoiceNumber = `INV-${String((count ?? 0) + 1).padStart(4, "0")}`;

  const { error } = await supabase.rpc("create_invoice", {
    p_id: invoiceId,
    p_client_id: ownership.client_id,
    p_invoice_number: invoiceNumber,
    p_visit_id: visitId
  });

  if (error) throw new Error(`Unable to create the invoice: ${error.message}`);

  redirect(`/practice/invoices/${invoiceId}`);
}
