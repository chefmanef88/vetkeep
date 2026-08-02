"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { readableError } from "@/lib/practice/format";
import { definedArgs, optionalNumber } from "@/lib/practice/rpc-args";

const TYPES = [
  { value: "drug", label: "Drug" },
  { value: "consumable", label: "Consumable" },
  { value: "vaccine", label: "Vaccine" },
  { value: "other", label: "Other" }
];

export function NewItemForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const supabase = createClient();

    const { error: rpcError } = await supabase.rpc(
      "create_inventory_item",
      definedArgs({
        p_id: crypto.randomUUID(),
        p_item_name: String(form.get("itemName") ?? ""),
        p_item_type: String(form.get("itemType") ?? "drug"),
        p_unit: String(form.get("unit") ?? ""),
        p_reorder_threshold: optionalNumber(form.get("reorderThreshold"))
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
      <div className="grid">
        <label>
          Item
          <input name="itemName" required maxLength={160} placeholder="Meloxicam 5 mg/mL" />
        </label>
        <label>
          Type
          <select name="itemType" defaultValue="drug">
            {TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid">
        <label>
          Unit
          <input name="unit" required maxLength={30} placeholder="mL" />
        </label>
        <label>
          Warn me below
          <input name="reorderThreshold" inputMode="decimal" placeholder="20" />
        </label>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Add item"}
      </button>
    </form>
  );
}
