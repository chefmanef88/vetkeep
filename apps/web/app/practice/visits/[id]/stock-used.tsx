"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { formatDate, readableError } from "@/lib/practice/format";
import { definedArgs, optionalText } from "@/lib/practice/rpc-args";

export type UsableBatch = {
  id: string;
  itemName: string;
  unit: string;
  lotNumber: string | null;
  expiryDate: string | null;
  quantityOnHand: number;
};

export type ConsumedMovement = {
  id: string;
  quantity: number;
  notes: string | null;
  itemName: string;
  unit: string;
  lotNumber: string | null;
};

export function StockUsed({
  visitId,
  batches,
  consumed,
  editable
}: {
  visitId: string;
  batches: UsableBatch[];
  consumed: ConsumedMovement[];
  editable: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const batchId = String(form.get("batchId") ?? "");
    const quantity = Number(String(form.get("quantity") ?? ""));
    const batch = batches.find((b) => b.id === batchId);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setBusy(false);
      setError("Enter how much you used, as a number greater than zero.");
      return;
    }
    if (batch && quantity > batch.quantityOnHand) {
      setBusy(false);
      setError(
        `Only ${batch.quantityOnHand} ${batch.unit} left in that batch. Record what you actually used, or receive more stock first.`
      );
      return;
    }

    const supabase = createClient();

    // The movement id is minted here, so a retried sync records the same
    // consumption once rather than deducting the stock twice.
    const { error: rpcError } = await supabase.rpc(
      "record_inventory_consumption",
      definedArgs({
        p_movement_id: crypto.randomUUID(),
        p_batch_id: batchId,
        p_visit_id: visitId,
        p_quantity: quantity,
        p_notes: optionalText(form.get("notes"))
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

  return (
    <section className="card stack">
      <h2>Stock used</h2>

      {consumed.length ? (
        <ul className="record-list">
          {consumed.map((movement) => (
            <li key={movement.id}>
              <div className="row-head">
                <strong>{movement.itemName}</strong>
                <span>
                  {Math.abs(movement.quantity)} {movement.unit}
                </span>
              </div>
              <span className="muted">
                {movement.lotNumber ? `lot ${movement.lotNumber}` : "no lot number"}
                {movement.notes ? ` · ${movement.notes}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Nothing taken from the vehicle for this visit.</p>
      )}

      {editable ? (
        batches.length ? (
          <form className="stack" onSubmit={submit}>
            <div className="grid">
              <label>
                Batch
                <select name="batchId" required>
                  {batches.map((batch) => (
                    <option key={batch.id} value={batch.id}>
                      {batch.itemName}
                      {batch.lotNumber ? ` · lot ${batch.lotNumber}` : ""} — {batch.quantityOnHand}{" "}
                      {batch.unit} left
                      {batch.expiryDate ? `, expires ${formatDate(batch.expiryDate)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantity used
                <input name="quantity" inputMode="decimal" required />
              </label>
            </div>
            <label>
              Note
              <input name="notes" maxLength={300} placeholder="Given by mouth at the visit" />
            </label>
            {error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={busy}>
              {busy ? "Recording…" : "Record stock used"}
            </button>
          </form>
        ) : (
          <p className="muted">
            No usable stock on hand. Expired batches are never offered here, even when they are
            still in the vehicle.
          </p>
        )
      ) : null}
    </section>
  );
}
