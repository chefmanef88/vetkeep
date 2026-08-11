import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  concentrationLabel,
  strengthWarning,
  treatmentRouteLabel,
  treatmentRoutesFor
} from "@vetkeep/domain";
import { definedArgs, optionalNumber, optionalText } from "@vetkeep/contracts";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import { Card, FieldLabel, Muted, ScrollScreen, Segmented } from "@/ui/practice-components";
import { Collapsible, EmptyState, IconChip, ListHeader } from "@/ui/elements";
import { ErrorText, Field, PrimaryButton } from "@/ui/components";
import { fonts, hairline, palette, radius, space, type } from "@/ui/tokens";

/**
 * The products this vet uses, and what each one obliges.
 *
 * Not a stock count. Quantities, batches and expiry dates were specified as a
 * web-app job (brief §7.8) and this vet works from the phone, so a screen that
 * could only ever say "nothing recorded yet" was worth less than nothing.
 *
 * What survives is the half that matters: a product with its withholding
 * periods on file lets a treatment work out its own milk and meat dates. That
 * is the one calculation here with a food-safety consequence, and it should not
 * depend on a vet doing arithmetic at the end of a long day.
 */

type Product = {
  id: string;
  item_name: string;
  item_type: string;
  unit: string;
  active_ingredient: string | null;
  default_route: string | null;
  withdrawal_meat_days: number | null;
  withdrawal_milk_days: number | null;
  withdrawal_eggs_days: number | null;
  concentration_value: number | null;
  concentration_unit: string | null;
};

const STRENGTH_UNITS = [
  { value: "mg_per_ml", label: "mg/ml" },
  { value: "percent", label: "%" },
  { value: "iu_per_ml", label: "IU/ml" },
  { value: "mg_per_g", label: "mg/g" }
];

const TYPES = [
  { value: "drug", label: "Drug" },
  { value: "vaccine", label: "Vaccine" },
  { value: "consumable", label: "Consumable" },
  { value: "other", label: "Other" }
];

/** Every route a treatment may take, for a list that is not about one animal. */
const ALL_ROUTES = treatmentRoutesFor({
  species: "cattle",
  purpose: "milk",
  isGroup: false
}).concat(treatmentRoutesFor({ species: "poultry", purpose: "eggs", isGroup: true }));
const ROUTE_OPTIONS = [...new Set(ALL_ROUTES)].map((value) => ({
  value,
  label: treatmentRouteLabel(value)
}));

function withholdingLine(product: Product): string | null {
  const parts = [
    product.withdrawal_milk_days !== null ? `milk ${product.withdrawal_milk_days} d` : null,
    product.withdrawal_eggs_days !== null ? `eggs ${product.withdrawal_eggs_days} d` : null,
    product.withdrawal_meat_days !== null ? `meat ${product.withdrawal_meat_days} d` : null
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(" · ");
}

export default function ProductsScreen() {
  const [name, setName] = useState("");
  const [itemType, setItemType] = useState("drug");
  const [unit, setUnit] = useState("ml");
  const [activeIngredient, setActiveIngredient] = useState("");
  const [route, setRoute] = useState("im");
  const [strength, setStrength] = useState("");
  const [strengthUnit, setStrengthUnit] = useState("mg_per_ml");
  const [meatDays, setMeatDays] = useState("");
  const [milkDays, setMilkDays] = useState("");
  const [eggsDays, setEggsDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, loading, reload } = useQuery<Product[]>(async () => {
    const { data: rows, error: queryError } = await supabase
      .from("inventory_items")
      .select(
        "id, item_name, item_type, unit, active_ingredient, default_route, withdrawal_meat_days, withdrawal_milk_days, withdrawal_eggs_days, concentration_value, concentration_unit"
      )
      .eq("active", true)
      .is("deleted_at", null)
      .order("item_name", { ascending: true });
    if (queryError) throw new Error("Could not load your products.");
    return (rows ?? []) as Product[];
  }, []);

  const products = data ?? [];

  // Said as the strength is typed, where it can still be corrected without
  // rereading the label.
  const strengthNote =
    optionalNumber(strength) !== undefined
      ? strengthWarning({ value: optionalNumber(strength) as number, unit: strengthUnit as never })
      : null;

  function reset() {
    setName("");
    setItemType("drug");
    setUnit("ml");
    setActiveIngredient("");
    setRoute("im");
    setStrength("");
    setStrengthUnit("mg_per_ml");
    setMeatDays("");
    setMilkDays("");
    setEggsDays("");
  }

  async function save() {
    setError(null);
    if (name.trim() === "") {
      setError("Name the product.");
      return;
    }
    if (unit.trim() === "") {
      setError("Give the unit it is measured in.");
      return;
    }

    setBusy(true);
    const { error: rpcError } = await supabase.rpc(
      "upsert_product",
      definedArgs({
        p_id: globalThis.crypto.randomUUID(),
        p_item_name: name,
        p_item_type: itemType,
        p_unit: unit,
        p_active_ingredient: optionalText(activeIngredient),
        p_default_route: route,
        p_withdrawal_meat_days: optionalNumber(meatDays),
        p_withdrawal_milk_days: optionalNumber(milkDays),
        p_withdrawal_eggs_days: optionalNumber(eggsDays),
        // Both together or neither: a number without its unit is not a strength.
        p_concentration_value: optionalNumber(strength),
        p_concentration_unit: optionalNumber(strength) !== undefined ? strengthUnit : undefined
      })
    );
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    reset();
    reload();
  }

  return (
    <ScrollScreen>
      {loading && products.length === 0 ? <ActivityIndicator /> : null}

      {products.length > 0 ? <ListHeader title="Products" count={products.length} /> : null}

      {products.map((product) => {
        const withholding = withholdingLine(product);
        return (
          <View key={product.id} style={styles.row}>
            <IconChip
              name={product.item_type === "vaccine" ? "eyedrop" : "medkit"}
              tone={withholding ? "warn" : "brand"}
              size={40}
            />
            <View style={styles.body}>
              <Text style={styles.name}>{product.item_name}</Text>
              <Text style={styles.meta}>
                {product.active_ingredient ? `${product.active_ingredient} · ` : ""}
                {product.unit}
                {product.default_route ? ` · ${treatmentRouteLabel(product.default_route)}` : ""}
                {product.concentration_value !== null && product.concentration_unit
                  ? ` · ${product.concentration_value} ${concentrationLabel(product.concentration_unit)}`
                  : ""}
              </Text>
              {/* Stated plainly, because this is why the list exists. */}
              {withholding ? (
                <Text style={styles.withholding}>Withholding: {withholding}</Text>
              ) : (
                <Text style={styles.meta}>No withholding on file</Text>
              )}
            </View>
          </View>
        );
      })}

      {!loading && products.length === 0 ? (
        <EmptyState
          icon="medkit-outline"
          title="No products yet"
          hint="Add the ones you use as you use them. A product with its withholding periods lets a treatment work out its own dates."
        />
      ) : null}

      <Collapsible title="Add a product" icon="add-circle" initiallyOpen={products.length === 0}>
        <FieldLabel>Name</FieldLabel>
        <Field value={name} onChangeText={setName} placeholder="Oxytetracycline 20%" />

        <FieldLabel>Type</FieldLabel>
        <Segmented
          options={TYPES}
          value={itemType}
          onChange={setItemType}
          accessibilityLabel="Type"
        />

        <View style={styles.pairRow}>
          <View style={styles.pairCell}>
            <FieldLabel>Measured in</FieldLabel>
            <Field value={unit} onChangeText={setUnit} placeholder="ml" />
          </View>
          <View style={styles.pairCell}>
            <FieldLabel>Active ingredient</FieldLabel>
            <Field
              value={activeIngredient}
              onChangeText={setActiveIngredient}
              placeholder="Optional"
            />
          </View>
        </View>

        <FieldLabel>Usual route</FieldLabel>
        <Segmented
          options={ROUTE_OPTIONS.slice(0, 4)}
          value={route}
          onChange={setRoute}
          accessibilityLabel="Usual route"
        />

        {/* The strength is what turns a dose rate into a volume. Without it a
            treatment can still be recorded, but the arithmetic stays in the
            vet's head. */}
        <FieldLabel>Strength</FieldLabel>
        <View style={styles.pairRow}>
          <View style={styles.pairCell}>
            <Field
              value={strength}
              onChangeText={setStrength}
              keyboardType="decimal-pad"
              placeholder="200"
            />
          </View>
          <View style={styles.pairCellWide}>
            <Segmented
              options={STRENGTH_UNITS}
              value={strengthUnit}
              onChange={setStrengthUnit}
              accessibilityLabel="Strength unit"
            />
          </View>
        </View>
        {strengthNote ? <ErrorText>{strengthNote}</ErrorText> : null}
        <Muted>
          A percentage is grams per hundred millilitres, so 20% is 200 mg/ml. Enter it either way,
          but check which one the bottle says.
        </Muted>

        <FieldLabel>Withholding periods, in days</FieldLabel>
        <Muted>
          Leave a box empty where the product carries none. Empty is not the same as zero, and a
          treatment on a food animal will ask you for anything missing.
        </Muted>
        <View style={styles.pairRow}>
          <View style={styles.pairCell}>
            <FieldLabel>Meat</FieldLabel>
            <Field
              value={meatDays}
              onChangeText={setMeatDays}
              keyboardType="number-pad"
              placeholder="28"
            />
          </View>
          <View style={styles.pairCell}>
            <FieldLabel>Milk</FieldLabel>
            <Field
              value={milkDays}
              onChangeText={setMilkDays}
              keyboardType="number-pad"
              placeholder="7"
            />
          </View>
          <View style={styles.pairCell}>
            <FieldLabel>Eggs</FieldLabel>
            <Field
              value={eggsDays}
              onChangeText={setEggsDays}
              keyboardType="number-pad"
              placeholder="—"
            />
          </View>
        </View>

        {error ? <ErrorText>{error}</ErrorText> : null}
        <PrimaryButton
          label={busy ? "Saving…" : "Add product"}
          disabled={busy}
          onPress={() => void save()}
        />
      </Collapsible>

      <Card>
        <Muted>
          This is a list of what you use, not a count of what is in your bag. Quantities, batches
          and expiry dates are not tracked.
        </Muted>
      </Card>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
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
  body: { flex: 1, gap: 2 },
  name: { ...type.strong, color: palette.ink },
  meta: { ...type.small, fontSize: 12, color: palette.quiet },
  withholding: { fontFamily: fonts.semibold, fontSize: 12, color: palette.amber },
  pairRow: { flexDirection: "row", gap: space.md },
  pairCell: { flex: 1, gap: space.xs },
  pairCellWide: { flex: 2, gap: space.xs, justifyContent: "flex-end" }
});
