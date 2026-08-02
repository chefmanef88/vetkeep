"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { parseCedisToPesewas, readableError } from "@/lib/practice/format";
import { definedArgs, optionalText } from "@/lib/practice/rpc-args";

export function RestockForm({ items }: { items: { id: string; name: string; unit: string }[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const quantity = Number(String(form.get("quantity") ?? ""));

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setBusy(false);
      setError("Enter how much you received, as a number greater than zero.");
      return;
    }

    const costText = String(form.get("unitCost") ?? "").trim();
    const unitCost = costText === "" ? undefined : parseCedisToPesewas(costText);
    if (costText !== "" && unitCost === null) {
      setBusy(false);
      setError("Enter the unit cost as an amount, for example 12 or 12.50.");
      return;
    }

    const supabase = createClient();

    // The batch and the movement that created it are both client-generated ids,
    // so receiving stock offline and syncing later cannot double-count it.
    const { error: rpcError } = await supabase.rpc(
      "restock_inventory_batch",
      definedArgs({
        p_batch_id: crypto.randomUUID(),
        p_movement_id: crypto.randomUUID(),
        p_item_id: String(form.get("itemId") ?? ""),
        p_quantity: quantity,
        p_batch_lot_number: optionalText(form.get("lotNumber")),
        p_expiry_date: optionalText(form.get("expiryDate")),
        p_unit_cost_pesewas: unitCost ?? undefined
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
    <form className="stack" onSubmit={submit}>
      <p className="muted">
        A batch carries its own lot number and expiry, so you can tell which tube you used.
      </p>
      <div className="grid">
        <label>
          Item
          <select name="itemId" required>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.unit})
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity received
          <input name="quantity" inputMode="decimal" required />
        </label>
      </div>
      <div className="grid">
        <label>
          Lot number
          <input name="lotNumber" maxLength={80} />
        </label>
        <label>
          Expiry date
          <input type="date" name="expiryDate" />
        </label>
        <label>
          Unit cost (GHS)
          <input name="unitCost" inputMode="decimal" placeholder="12.50" />
        </label>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy}>
        {busy ? "Recording…" : "Receive stock"}
      </button>
    </form>
  );
}
