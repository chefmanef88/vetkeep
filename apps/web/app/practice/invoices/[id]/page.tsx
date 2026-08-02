import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatPesewas } from "@/lib/practice/format";
import { InvoiceEditor } from "./invoice-editor";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice, error } = await supabase
    .from("visit_invoices")
    .select(
      "id, invoice_number, status, currency, subtotal_pesewas, discount_pesewas, total_pesewas, amount_paid_pesewas, visit_id, issued_at, clients(name)"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error("Unable to load the invoice.");
  if (!invoice) notFound();

  const { data: items } = await supabase
    .from("invoice_items")
    .select("id, description, quantity, unit_price_pesewas, line_total_pesewas, sequence_number")
    .eq("invoice_id", id)
    .order("sequence_number", { ascending: true });

  const { data: payments } = await supabase
    .from("invoice_payments")
    .select("id, amount_pesewas, method, reference, paid_at")
    .eq("invoice_id", id)
    .order("paid_at", { ascending: true });

  const outstanding = invoice.total_pesewas - invoice.amount_paid_pesewas;

  return (
    <>
      <section className="card stack">
        {invoice.visit_id ? (
          <p className="muted">
            <Link href={`/practice/visits/${invoice.visit_id}`}>← Visit record</Link>
          </p>
        ) : null}
        <div className="row-head">
          <h1>
            <span className="code">{invoice.invoice_number}</span>
          </h1>
          <span className={`pill pill-${invoice.status}`}>{invoice.status}</span>
        </div>
        <p className="muted">{invoice.clients?.name}</p>
        <dl className="totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{formatPesewas(invoice.subtotal_pesewas, invoice.currency)}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatPesewas(invoice.total_pesewas, invoice.currency)}</dd>
          </div>
          <div>
            <dt>Paid</dt>
            <dd>{formatPesewas(invoice.amount_paid_pesewas, invoice.currency)}</dd>
          </div>
          <div>
            <dt>Outstanding</dt>
            <dd className={outstanding > 0 ? "outstanding-amount" : undefined}>
              {formatPesewas(outstanding, invoice.currency)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="card stack">
        <h2>Items</h2>
        {items?.length ? (
          <ul className="record-list">
            {items.map((item) => (
              <li key={item.id}>
                <div className="row-head">
                  <strong>{item.description}</strong>
                  <span>{formatPesewas(item.line_total_pesewas, invoice.currency)}</span>
                </div>
                <span className="muted">
                  {item.quantity} × {formatPesewas(item.unit_price_pesewas, invoice.currency)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No charges added yet.</p>
        )}
      </section>

      <InvoiceEditor
        invoiceId={invoice.id}
        status={invoice.status}
        outstandingPesewas={outstanding}
        currency={invoice.currency}
      />

      <section className="card stack">
        <h2>Payments</h2>
        {payments?.length ? (
          <ul className="record-list">
            {payments.map((payment) => (
              <li key={payment.id}>
                <div className="row-head">
                  <strong>{formatPesewas(payment.amount_pesewas, invoice.currency)}</strong>
                  <span className="pill">{payment.method}</span>
                </div>
                <span className="muted">
                  {formatDateTime(payment.paid_at)}
                  {payment.reference ? ` · ${payment.reference}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nothing recorded as paid yet.</p>
        )}
      </section>
    </>
  );
}
