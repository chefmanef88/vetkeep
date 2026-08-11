import { NewItemForm } from "./new-item-form";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CONCENTRATION_LABELS: Record<string, string> = {
  mg_per_ml: "mg/ml",
  percent: "%",
  iu_per_ml: "IU/ml",
  mg_per_g: "mg/g"
};

/**
 * The drug list. Not a stock count.
 *
 * This page used to sum live batches, exclude expired ones, and warn below a
 * restock level. All of that was removed (brief §7.8): nobody counts what is in
 * the boot of their car, and a low-stock warning derived from a quantity that
 * stopped being maintained in week one is not useless but wrong.
 *
 * What a product entry is for now is the opposite direction. It does not say how
 * much is left. It says what the product *obliges* — its strength, so a dose can
 * be calculated, and its withholding periods, so a treatment can work out when
 * milk and meat are safe again. Those are properties of the product, and they
 * are the ones a record cannot be written correctly without.
 */
export default async function InventoryPage() {
  const supabase = await createClient();

  const { data: products, error } = await supabase
    .from("inventory_items")
    .select(
      "id, item_name, item_type, unit, active_ingredient, default_route, concentration_value, concentration_unit, withdrawal_meat_days, withdrawal_milk_days, withdrawal_eggs_days, active"
    )
    .is("deleted_at", null)
    .eq("active", true)
    .order("item_name", { ascending: true });

  if (error) throw new Error("Unable to load the drug list.");

  const items = products ?? [];

  return (
    <>
      <section className="card stack">
        <h1>Products</h1>
        <p className="muted">
          What you use, and what each one obliges. Quantities are deliberately not tracked — a count
          nobody maintains is worse than no count, because the warning drawn from it stops being
          true.
        </p>

        {items.length ? (
          <ul className="record-list">
            {items.map((row) => {
              const strength =
                row.concentration_value !== null && row.concentration_unit !== null
                  ? `${row.concentration_value} ${
                      CONCENTRATION_LABELS[row.concentration_unit] ?? row.concentration_unit
                    }`
                  : null;

              const withdrawals = [
                row.withdrawal_meat_days !== null ? `meat ${row.withdrawal_meat_days} d` : null,
                row.withdrawal_milk_days !== null ? `milk ${row.withdrawal_milk_days} d` : null,
                row.withdrawal_eggs_days !== null ? `eggs ${row.withdrawal_eggs_days} d` : null
              ].filter((entry): entry is string => entry !== null);

              return (
                <li key={row.id}>
                  <div className="row-head">
                    <strong>{row.item_name}</strong>
                    <span className="muted">{strength ?? "no strength on file"}</span>
                  </div>
                  <span className="muted">
                    {row.item_type}
                    {row.active_ingredient ? ` · ${row.active_ingredient}` : ""}
                    {row.default_route ? ` · ${row.default_route}` : ""}
                  </span>
                  {/* The half of this record with a food-safety consequence. */}
                  <span className="muted">
                    {withdrawals.length
                      ? `Withholding: ${withdrawals.join(" · ")}`
                      : "No withholding periods on file"}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">Nothing recorded yet. Add the first product below.</p>
        )}
      </section>

      <section className="card stack">
        <h2>Add a product</h2>
        <NewItemForm />
      </section>
    </>
  );
}
