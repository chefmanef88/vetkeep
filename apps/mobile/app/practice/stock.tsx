import { ActivityIndicator, View, StyleSheet, Text } from "react-native";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import { Card, Muted, Pill, ScrollScreen, SectionTitle, palette } from "@/ui/practice-components";
import { ErrorText } from "@/ui/components";

type StockRow = {
  item_id: string | null;
  item_name: string | null;
  item_type: string | null;
  unit: string | null;
  available_quantity: number | null;
  expired_quantity: number | null;
  reorder_threshold: number | null;
  is_low_stock: boolean | null;
  active: boolean | null;
};

export default function StockScreen() {
  const { data, error, loading } = useQuery<StockRow[]>(async () => {
    const { data: rows, error: queryError } = await supabase
      .from("inventory_item_stock")
      .select(
        "item_id, item_name, item_type, unit, available_quantity, expired_quantity, reorder_threshold, is_low_stock, active"
      )
      .order("item_name", { ascending: true });
    if (queryError) throw new Error("Could not load your stock.");
    return (rows ?? []) as StockRow[];
  }, []);

  const items = (data ?? []).filter((row) => row.active && row.item_name);
  const low = items.filter((row) => row.is_low_stock);

  return (
    <ScrollScreen>
      <Card>
        <SectionTitle>What I am carrying</SectionTitle>
        <Muted>
          Expired batches stay listed so you know they are in the bag, but they never count towards
          what is available.
        </Muted>

        {loading ? <ActivityIndicator /> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}

        {low.length > 0 ? (
          <View style={styles.warning}>
            <Text style={styles.warningText}>
              {low.length} item{low.length === 1 ? "" : "s"} at or below the restock level.
            </Text>
          </View>
        ) : null}

        {!loading && items.length === 0 ? <Muted>Nothing recorded yet.</Muted> : null}

        {items.map((row) => (
          <View key={row.item_id} style={styles.row}>
            <View style={styles.rowBody}>
              <Text style={styles.itemName}>{row.item_name}</Text>
              <Muted>
                {row.item_type}
                {row.reorder_threshold !== null
                  ? ` · restock at ${row.reorder_threshold} ${row.unit ?? ""}`
                  : ""}
                {Number(row.expired_quantity ?? 0) > 0
                  ? ` · ${row.expired_quantity} ${row.unit ?? ""} expired`
                  : ""}
              </Muted>
            </View>
            <View style={styles.qty}>
              <Text style={styles.qtyText}>
                {row.available_quantity} {row.unit}
              </Text>
              {row.is_low_stock ? <Pill label="low" tone="warn" /> : null}
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <Muted>
          Receiving stock and writing off expired batches is done on the web app, where a full
          keyboard makes lot numbers and expiry dates quicker to enter.
        </Muted>
      </Card>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  warning: {
    backgroundColor: palette.amberSoft,
    borderLeftWidth: 4,
    borderLeftColor: palette.amber,
    borderRadius: 8,
    padding: 12
  },
  warningText: { color: palette.amber, fontWeight: "700" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.line
  },
  rowBody: { flex: 1, gap: 2 },
  itemName: { fontSize: 16, fontWeight: "700", color: palette.ink },
  qty: { alignItems: "flex-end", gap: 4 },
  qtyText: { fontSize: 16, fontWeight: "800", color: palette.ink, fontVariant: ["tabular-nums"] }
});
