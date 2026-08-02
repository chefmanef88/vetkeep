"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { formatPesewas, parseCedisToPesewas, readableError } from "@/lib/practice/format";
import { definedArgs, optionalText } from "@/lib/practice/rpc-args";

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "momo", label: "Mobile money" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card_external", label: "Card" },
  { value: "other", label: "Other" }
];

export function InvoiceEditor({
  invoiceId,
  status,
  outstandingPesewas,
  currency
}: {
  invoiceId: string;
  status: string;
  outstandingPesewas: number;
  currency: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isDraft = status === "draft";
  const isVoided = status === "voided";
  const isSettled = status === "paid";

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const unitPrice = parseCedisToPesewas(String(form.get("unitPrice") ?? ""));
    const quantity = Number(String(form.get("quantity") ?? "1"));

    if (unitPrice === null) {
      setBusy(false);
      setError("Enter the unit price as an amount, for example 150 or 150.50.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setBusy(false);
      setError("Quantity must be greater than zero.");
      return;
    }

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("add_invoice_item", {
      p_id: crypto.randomUUID(),
      p_invoice_id: invoiceId,
      p_description: String(form.get("description") ?? ""),
      p_quantity: quantity,
      p_unit_price_pesewas: unitPrice
    });

    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }
    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  async function issue() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("issue_invoice", { p_id: invoiceId });
    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }
    router.refresh();
  }

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const amount = parseCedisToPesewas(String(form.get("amount") ?? ""));

    if (amount === null || amount <= 0) {
      setBusy(false);
      setError("Enter the amount received, for example 150 or 150.50.");
      return;
    }

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc(
      "record_invoice_payment",
      definedArgs({
        p_id: crypto.randomUUID(),
        p_invoice_id: invoiceId,
        p_amount_pesewas: amount,
        p_method: String(form.get("method") ?? "cash"),
        p_paid_at: new Date().toISOString(),
        p_reference: optionalText(form.get("reference"))
      })
    );

    setBusy(false);
    if (rpcError) {
      setError(readableError(rpcError.message));
      return;
    }
    (event.target as HTMLFormElement).reset();
    router.refresh();
  }

  if (isVoided) {
    return (
      <section className="card stack">
        <p className="muted">
          This invoice is voided. No further charges or payments can be added.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="card stack">
        <h2>Add a charge</h2>
        <p className="muted">
          Consultation, call-out fee, medication — anything the client is paying for.
        </p>
        <form className="stack" onSubmit={addItem}>
          <label>
            Description
            <input
              name="description"
              required
              maxLength={300}
              placeholder="House-call consultation"
            />
          </label>
          <div className="grid">
            <label>
              Quantity
              <input name="quantity" inputMode="decimal" defaultValue="1" required />
            </label>
            <label>
              Unit price ({currency})
              <input name="unitPrice" inputMode="decimal" required placeholder="150.00" />
            </label>
          </div>
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add charge"}
          </button>
        </form>
      </section>

      {isDraft ? (
        <section className="card stack">
          <h2>Issue this invoice</h2>
          <p className="muted">
            Issuing turns the draft into a receivable the client owes. Add every charge first.
          </p>
          <button type="button" onClick={issue} disabled={busy}>
            {busy ? "Issuing…" : "Issue invoice"}
          </button>
        </section>
      ) : null}

      {!isDraft && !isSettled ? (
        <section className="card stack">
          <h2>Record a payment</h2>
          <p className="muted">
            {formatPesewas(outstandingPesewas, currency)} outstanding. VetKeep records this money;
            it never handles it.
          </p>
          <form className="stack" onSubmit={recordPayment}>
            <div className="grid">
              <label>
                Amount received ({currency})
                <input name="amount" inputMode="decimal" required />
              </label>
              <label>
                Method
                <select name="method" defaultValue="cash">
                  {METHODS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Reference
              <input name="reference" maxLength={120} placeholder="MoMo transaction id" />
            </label>
            {error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={busy}>
              {busy ? "Recording…" : "Record payment"}
            </button>
          </form>
        </section>
      ) : null}

      {isSettled ? (
        <section className="card stack">
          <p role="status">This invoice is settled in full.</p>
        </section>
      ) : null}
    </>
  );
}
