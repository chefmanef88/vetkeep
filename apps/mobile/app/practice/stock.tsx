import { ActivityIndicator, View, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import { Card, Muted, ScrollScreen } from "@/ui/practice-components";
import { EmptyState, IconChip, ListHeader, StatTile } from "@/ui/elements";
import { fonts, hairline, palette, radius, radiusControl, space, type } from "@/ui/tokens";
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

/** Rough mapping from what a thing is to something recognisable at a glance. */
function iconFor(itemType: string | null): keyof typeof Ionicons.glyphMap {
  switch ((itemType ?? "").toLowerCase()) {
    case "drug":
    case "medication":
      return "medkit";
    case "vaccine":
      return "eyedrop";
    case "consumable":
      return "bandage";
    default:
      return "cube";
  }
}

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
  const expired = items.filter((row) => Number(row.expired_quantity ?? 0) > 0);

  return (
    <ScrollScreen>
      {loading ? <ActivityIndicator /> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}

      {items.length > 0 ? (
        <View style={styles.statRow}>
          <StatTile
            icon="cube"
            label="Items carried"
            value={items.length}
            tone={low.length > 0 ? "neutral" : "good"}
          />
          <StatTile
            icon={low.length > 0 ? "alert-circle" : "checkmark-circle"}
            label="Need restocking"
            value={low.length}
            tone={low.length > 0 ? "warn" : "good"}
          />
        </View>
      ) : null}

      {expired.length > 0 ? (
        <View style={styles.notice}>
          <Ionicons name="time-outline" size={18} color={palette.amber} />
          <Text style={styles.noticeText}>
            {expired.length} item{expired.length === 1 ? " has" : "s have"} expired stock still in
            the bag. It is listed but never counted as available.
          </Text>
        </View>
      ) : null}

      {items.length > 0 ? <ListHeader title="In the vehicle" count={items.length} /> : null}

      {items.map((row) => (
        <View key={row.item_id} style={[styles.row, row.is_low_stock && styles.rowLow]}>
          <IconChip
            name={iconFor(row.item_type)}
            tone={row.is_low_stock ? "warn" : "brand"}
            size={40}
          />
          <View style={styles.rowBody}>
            <Text style={styles.itemName} numberOfLines={1}>
              {row.item_name}
            </Text>
            <Text style={styles.itemMeta} numberOfLines={2}>
              {row.item_type}
              {row.reorder_threshold !== null
                ? ` · restock at ${row.reorder_threshold} ${row.unit ?? ""}`
                : ""}
              {Number(row.expired_quantity ?? 0) > 0
                ? ` · ${row.expired_quantity} ${row.unit ?? ""} expired`
                : ""}
            </Text>
          </View>
          <View style={styles.qty}>
            {/* The number is the point of this screen, so it is set larger than
                anything around it rather than buried in a sentence. */}
            <Text style={[styles.qtyValue, row.is_low_stock && styles.qtyLow]}>
              {row.available_quantity}
            </Text>
            <Text style={styles.qtyUnit}>{row.unit}</Text>
            {row.is_low_stock ? <Text style={styles.lowTag}>Low</Text> : null}
          </View>
        </View>
      ))}

      {!loading && items.length === 0 ? (
        <EmptyState
          icon="cube-outline"
          title="Nothing recorded yet"
          hint="Stock you are carrying appears here once it is received on the web app."
        />
      ) : null}

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
  statRow: { flexDirection: "row", gap: space.md },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.md,
    backgroundColor: palette.amberSoft,
    borderRadius: radiusControl,
    borderLeftWidth: 4,
    borderLeftColor: palette.amber,
    padding: space.md
  },
  noticeText: { ...type.small, color: palette.amber, flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    backgroundColor: palette.surface,
    borderRadius: radius,
    borderWidth: hairline,
    borderColor: palette.line
  },
  // Low stock is stated by the word "Low" as well as the tint, never colour alone.
  rowLow: { borderColor: palette.amber, backgroundColor: palette.amberSoft },
  rowBody: { flex: 1, gap: 2 },
  itemName: { ...type.strong, color: palette.ink },
  itemMeta: { ...type.small, fontSize: 12, color: palette.quiet },
  qty: { alignItems: "flex-end", minWidth: 56 },
  qtyValue: { fontFamily: fonts.bold, fontSize: 22, color: palette.ink },
  qtyLow: { color: palette.amber },
  qtyUnit: { fontFamily: fonts.regular, fontSize: 11, color: palette.quiet },
  lowTag: { fontFamily: fonts.semibold, fontSize: 10, color: palette.amber, marginTop: 2 }
});
