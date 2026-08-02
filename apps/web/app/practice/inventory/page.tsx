import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/practice/format";
import { NewItemForm } from "./new-item-form";
import { RestockForm } from "./restock-form";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const supabase = await createClient();

  // Stock is derived, never stored: this view sums live batches and excludes
  // anything expired, so the number here is what is actually usable today.
  const { data: stock, error } = await supabase
    .from("inventory_item_stock")
    .select(
      "item_id, item_name, item_type, unit, available_quantity, expired_quantity, reorder_threshold, is_low_stock, active"
    )
    .order("item_name", { ascending: true });

  if (error) throw new Error("Unable to load the stock position.");

  const { data: batches } = await supabase
    .from("inventory_batches")
    .select("id, item_id, batch_lot_number, expiry_date, quantity_on_hand")
    .is("deleted_at", null)
    .gt("quantity_on_hand", 0)
    .order("expiry_date", { ascending: true, nullsFirst: false });

  // Every column on a view is nullable as far as the generated types are
  // concerned, so narrow to the rows that actually carry an item before use
  // rather than asserting non-null.
  const items = (stock ?? [])
    .filter((row) => row.active && row.item_id !== null && row.item_name !== null)
    .map((row) => ({
      ...row,
      itemId: row.item_id as string,
      itemName: row.item_name as string,
      unit: row.unit ?? ""
    }));
  const lowStock = items.filter((row) => row.is_low_stock);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <section className="card stack">
        <h1>What you are carrying</h1>
        <p className="muted">
          The drugs and consumables in your vehicle. Expired batches are excluded from what is
          available, even while they are still physically in the bag.
        </p>

        {lowStock.length ? (
          <p className="warning" role="status">
            {lowStock.length} item{lowStock.length === 1 ? "" : "s"} at or below the restock level:{" "}
            {lowStock.map((row) => row.itemName).join(", ")}.
          </p>
        ) : null}

        {items.length ? (
          <ul className="record-list">
            {items.map((row) => {
              const itemBatches = (batches ?? []).filter((b) => b.item_id === row.itemId);
              return (
                <li key={row.itemId}>
                  <div className="row-head">
                    <strong>{row.itemName}</strong>
                    <span className={row.is_low_stock ? "stock-low" : "stock-ok"}>
                      {row.available_quantity} {row.unit}
                    </span>
                  </div>
                  <span className="muted">
                    {row.item_type}
                    {row.reorder_threshold !== null
                      ? ` · restock at ${row.reorder_threshold} ${row.unit}`
                      : ""}
                    {Number(row.expired_quantity) > 0
                      ? ` · ${row.expired_quantity} ${row.unit} expired`
                      : ""}
                  </span>
                  {itemBatches.length ? (
                    <ul className="batch-list">
                      {itemBatches.map((batch) => (
                        <li
                          key={batch.id}
                          className={
                            batch.expiry_date && batch.expiry_date < today ? "batch-expired" : ""
                          }
                        >
                          <span className="code">{batch.batch_lot_number ?? "no lot number"}</span>
                          <span>
                            {batch.quantity_on_hand} {row.unit}
                          </span>
                          <span className="muted">
                            {batch.expiry_date
                              ? `expires ${formatDate(batch.expiry_date)}`
                              : "no expiry recorded"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="muted">No stock on hand.</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">Nothing recorded yet. Add the first item below.</p>
        )}
      </section>

      {items.length ? (
        <section className="card stack">
          <h2>Receive stock</h2>
          <RestockForm
            items={items.map((row) => ({ id: row.itemId, name: row.itemName, unit: row.unit }))}
          />
        </section>
      ) : null}

      <section className="card stack">
        <h2>Add an item</h2>
        <NewItemForm />
      </section>
    </>
  );
}
