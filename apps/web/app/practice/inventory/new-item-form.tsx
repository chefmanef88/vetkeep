"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { readableError } from "@/lib/practice/format";
import { definedArgs, optionalNumber, optionalText } from "@/lib/practice/rpc-args";

const TYPES = [
  { value: "drug", label: "Drug" },
  { value: "consumable", label: "Consumable" },
  { value: "vaccine", label: "Vaccine" },
  { value: "other", label: "Other" }
];

const ROUTES = [
  { value: "", label: "No usual route" },
  { value: "oral", label: "Oral" },
  { value: "im", label: "Intramuscular" },
  { value: "iv", label: "Intravenous" },
  { value: "sc", label: "Subcutaneous" },
  { value: "topical", label: "Topical" },
  { value: "intramammary", label: "Intramammary" },
  { value: "in_water", label: "In water" },
  { value: "in_feed", label: "In feed" }
];

const STRENGTH_UNITS = [
  { value: "mg_per_ml", label: "mg/ml" },
  { value: "percent", label: "%" },
  { value: "iu_per_ml", label: "IU/ml" },
  { value: "mg_per_g", label: "mg/g" }
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
    const strength = optionalNumber(form.get("strength"));

    const { error: rpcError } = await supabase.rpc(
      "upsert_product",
      definedArgs({
        p_id: crypto.randomUUID(),
        p_item_name: String(form.get("itemName") ?? ""),
        p_item_type: String(form.get("itemType") ?? "drug"),
        p_unit: String(form.get("unit") ?? ""),
        p_active_ingredient: optionalText(form.get("activeIngredient")),
        p_default_route: optionalText(form.get("defaultRoute")),
        // Both together or neither: a number without its unit is not a strength.
        p_concentration_value: strength,
        p_concentration_unit:
          strength !== undefined ? String(form.get("strengthUnit") ?? "mg_per_ml") : undefined,
        p_withdrawal_meat_days: optionalNumber(form.get("meatDays")),
        p_withdrawal_milk_days: optionalNumber(form.get("milkDays")),
        p_withdrawal_eggs_days: optionalNumber(form.get("eggsDays"))
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
          Product
          <input name="itemName" required maxLength={160} placeholder="Oxytetracycline 20%" />
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
          Active ingredient
          <input name="activeIngredient" maxLength={160} placeholder="Oxytetracycline" />
        </label>
        <label>
          Unit
          <input name="unit" required maxLength={30} placeholder="ml" />
        </label>
      </div>

      <div className="grid">
        <label>
          Strength
          <input name="strength" inputMode="decimal" placeholder="200" />
        </label>
        <label>
          Strength unit
          <select name="strengthUnit" defaultValue="mg_per_ml">
            {STRENGTH_UNITS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">
        A percentage is grams per 100 ml: 20% is 200 mg/ml. Recording it lets a dose be calculated
        from a rate and the animal&rsquo;s weight.
      </p>

      <label>
        Usual route
        <select name="defaultRoute" defaultValue="">
          {ROUTES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid">
        <label>
          Meat withholding (days)
          <input name="meatDays" inputMode="numeric" placeholder="28" />
        </label>
        <label>
          Milk withholding (days)
          <input name="milkDays" inputMode="numeric" placeholder="7" />
        </label>
        <label>
          Egg withholding (days)
          <input name="eggsDays" inputMode="numeric" placeholder="0" />
        </label>
      </div>
      <p className="muted">
        Leave a period blank if the product carries none. Blank means none, which is not the same as
        zero days, and the two must not be confused when a treatment is recorded.
      </p>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Add product"}
      </button>
    </form>
  );
}
