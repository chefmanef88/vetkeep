import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  defaultTreatmentRoute,
  requiredWithdrawals,
  treatmentRouteLabel,
  treatmentRoutesFor,
  type WithdrawalKind
} from "@vetkeep/domain";
import { definedArgs, optionalNumber, optionalText } from "@vetkeep/contracts";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import { Card, FieldLabel, Muted, Segmented } from "@/ui/practice-components";
import { Collapsible, OptionChips } from "@/ui/elements";
import { ErrorText, Field, PrimaryButton } from "@/ui/components";
import { fonts, hairline, palette, radiusControl, space, type } from "@/ui/tokens";

/**
 * Treatments given during a consultation, and the withholding they create.
 *
 * This is the part of the record a farmer rings about. "When can I sell the
 * milk" cannot be answered from prose, so a treatment is a row and the answer
 * is a date the app computes rather than one the vet has to remember at the end
 * of a long day.
 */

type CarriedItem = {
  id: string;
  item_name: string;
  unit: string;
  active_ingredient: string | null;
  default_route: string | null;
  withdrawal_meat_days: number | null;
  withdrawal_milk_days: number | null;
  withdrawal_eggs_days: number | null;
};

type TreatmentRow = {
  id: string;
  product_name: string;
  dose_value: number;
  dose_unit: string;
  route: string;
  administered_at: string;
  duration_days: number | null;
  animals_treated: number | null;
  meat_withhold_until: string | null;
  milk_withhold_until: string | null;
  eggs_withhold_until: string | null;
  withdrawal_source: string;
};

const WITHDRAWAL_LABEL: Record<WithdrawalKind, string> = {
  meat: "Meat",
  milk: "Milk",
  eggs: "Eggs"
};

function formatDay(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

/** A withholding date only matters until it passes. */
function stillWithheld(until: string | null): boolean {
  if (!until) return false;
  return new Date(`${until}T23:59:59`) >= new Date();
}

export function TreatmentsSection({
  visitId,
  species,
  purpose,
  isGroup,
  editable
}: {
  visitId: string;
  species: string;
  purpose: string;
  isGroup: boolean;
  editable: boolean;
}) {
  const required = requiredWithdrawals({ species, purpose });

  const [itemId, setItemId] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [dose, setDose] = useState("");
  const [doseUnit, setDoseUnit] = useState("ml");
  const [route, setRoute] = useState<string>(defaultTreatmentRoute({ species, purpose, isGroup }));
  const [durationDays, setDurationDays] = useState("");
  const [animalsTreated, setAnimalsTreated] = useState("");
  const [meatUntil, setMeatUntil] = useState("");
  const [milkUntil, setMilkUntil] = useState("");
  const [eggsUntil, setEggsUntil] = useState("");
  const [noneRequired, setNoneRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, reload } = useQuery<{
    treatments: TreatmentRow[];
    carried: CarriedItem[];
  }>(async () => {
    const [treatmentResult, carriedResult] = await Promise.all([
      supabase
        .from("treatments")
        .select(
          "id, product_name, dose_value, dose_unit, route, administered_at, duration_days, animals_treated, meat_withhold_until, milk_withhold_until, eggs_withhold_until, withdrawal_source"
        )
        .eq("visit_id", visitId)
        .is("deleted_at", null)
        .order("administered_at", { ascending: true }),
      // The drug list, not a stock count: what this vet uses, and what each
      // product obliges. Quantities are not tracked.
      supabase
        .from("inventory_items")
        .select(
          "id, item_name, unit, active_ingredient, default_route, withdrawal_meat_days, withdrawal_milk_days, withdrawal_eggs_days"
        )
        .eq("active", true)
        .is("deleted_at", null)
        .order("item_name", { ascending: true })
    ]);

    return {
      treatments: (treatmentResult.data ?? []) as TreatmentRow[],
      carried: (carriedResult.data ?? []) as unknown as CarriedItem[]
    };
  }, [visitId]);

  const treatments = data?.treatments ?? [];
  const carried = data?.carried ?? [];
  const chosen = carried.find((item) => item.id === itemId) ?? null;

  /**
   * A carried product with periods on file resolves its own dates server-side.
   * Anything else, on an animal that owes withholding, has to be answered here.
   */
  const formularyCovers = (kind: WithdrawalKind): boolean => {
    if (!chosen) return false;
    if (kind === "meat") return chosen.withdrawal_meat_days !== null;
    if (kind === "milk") return chosen.withdrawal_milk_days !== null;
    return chosen.withdrawal_eggs_days !== null;
  };

  const mustAsk = required.filter((kind) => !formularyCovers(kind)) as WithdrawalKind[];

  function chooseItem(next: string) {
    setItemId(next);
    const item = carried.find((candidate) => candidate.id === next);
    if (!item) return;
    setProductName(item.item_name);
    setDoseUnit(item.unit);
    if (item.default_route) setRoute(item.default_route);
  }

  function reset() {
    setItemId(null);
    setProductName("");
    setDose("");
    setDurationDays("");
    setAnimalsTreated("");
    setMeatUntil("");
    setMilkUntil("");
    setEggsUntil("");
    setNoneRequired(false);
  }

  async function record() {
    setError(null);
    if (productName.trim() === "") {
      setError("Name the product that was given.");
      return;
    }
    if (optionalNumber(dose) === undefined) {
      setError("Enter the dose.");
      return;
    }

    setBusy(true);
    const { error: rpcError } = await supabase.rpc(
      "record_treatment",
      definedArgs({
        p_id: globalThis.crypto.randomUUID(),
        p_visit_id: visitId,
        p_product_name: productName,
        p_dose_value: optionalNumber(dose),
        p_dose_unit: doseUnit,
        p_route: route,
        p_inventory_item_id: itemId ?? undefined,
        p_active_ingredient: optionalText(chosen?.active_ingredient ?? ""),
        p_duration_days: optionalNumber(durationDays),
        p_animals_treated: isGroup ? optionalNumber(animalsTreated) : undefined,
        p_meat_withhold_until: optionalText(meatUntil),
        p_milk_withhold_until: optionalText(milkUntil),
        p_eggs_withhold_until: optionalText(eggsUntil),
        // Asserting that nothing is withheld is a deliberate act, never a
        // default, so it is only sent when the vet ticked it.
        p_withdrawal_source: noneRequired ? "none_required" : itemId ? "formulary" : "manual"
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
    <Collapsible
      title="Treatments given"
      icon="medkit"
      hint={treatments.length === 0 ? "None recorded" : `${treatments.length} recorded`}
      tone={required.length > 0 ? "warn" : "brand"}
    >
      {required.length > 0 ? (
        <Muted>
          This animal is kept for {purpose}. Every treatment needs{" "}
          {required.map((kind) => WITHDRAWAL_LABEL[kind].toLowerCase()).join(" and ")} withholding.
        </Muted>
      ) : null}

      {treatments.map((treatment) => {
        const withheld = [
          treatment.meat_withhold_until
            ? `Meat until ${formatDay(treatment.meat_withhold_until)}`
            : null,
          treatment.milk_withhold_until
            ? `Milk until ${formatDay(treatment.milk_withhold_until)}`
            : null,
          treatment.eggs_withhold_until
            ? `Eggs until ${formatDay(treatment.eggs_withhold_until)}`
            : null
        ].filter((entry): entry is string => entry !== null);
        const active =
          stillWithheld(treatment.meat_withhold_until) ||
          stillWithheld(treatment.milk_withhold_until) ||
          stillWithheld(treatment.eggs_withhold_until);

        return (
          <View key={treatment.id} style={[styles.given, active && styles.givenWithheld]}>
            <Text style={styles.product}>{treatment.product_name}</Text>
            <Text style={styles.detail}>
              {treatment.dose_value} {treatment.dose_unit} · {treatmentRouteLabel(treatment.route)}
              {treatment.duration_days ? ` · ${treatment.duration_days} days` : ""}
              {treatment.animals_treated ? ` · ${treatment.animals_treated} animals` : ""}
            </Text>
            {withheld.length > 0 ? (
              <Text style={[styles.withheld, active && styles.withheldActive]}>
                {withheld.join(" · ")}
              </Text>
            ) : treatment.withdrawal_source === "none_required" ? (
              <Text style={styles.detail}>No withholding required</Text>
            ) : null}
          </View>
        );
      })}

      {editable ? (
        <>
          {carried.length > 0 ? (
            <>
              <FieldLabel>From what you are carrying</FieldLabel>
              <OptionChips
                options={carried.map((item) => ({ value: item.id, label: item.item_name }))}
                value={itemId}
                onChange={chooseItem}
                accessibilityLabel="Product carried"
              />
            </>
          ) : null}

          <FieldLabel>Product</FieldLabel>
          <Field
            value={productName}
            onChangeText={setProductName}
            placeholder="Name it if you did not carry it"
          />

          <View style={styles.pairRow}>
            <View style={styles.pairCell}>
              <FieldLabel>Dose</FieldLabel>
              <Field
                value={dose}
                onChangeText={setDose}
                keyboardType="decimal-pad"
                placeholder="20"
              />
            </View>
            <View style={styles.pairCell}>
              <FieldLabel>Unit</FieldLabel>
              <Field value={doseUnit} onChangeText={setDoseUnit} placeholder="ml" />
            </View>
          </View>

          <FieldLabel>Route</FieldLabel>
          <Segmented
            options={treatmentRoutesFor({ species, purpose, isGroup }).map((value) => ({
              value,
              label: treatmentRouteLabel(value)
            }))}
            value={route}
            onChange={setRoute}
            accessibilityLabel="Route"
          />

          <View style={styles.pairRow}>
            <View style={styles.pairCell}>
              <FieldLabel>Days of treatment</FieldLabel>
              <Field
                value={durationDays}
                onChangeText={setDurationDays}
                keyboardType="number-pad"
                placeholder="1"
              />
            </View>
            {isGroup ? (
              <View style={styles.pairCell}>
                <FieldLabel>Animals treated</FieldLabel>
                <Field
                  value={animalsTreated}
                  onChangeText={setAnimalsTreated}
                  keyboardType="number-pad"
                  placeholder="400"
                />
              </View>
            ) : null}
          </View>

          {required.length > 0 && chosen && mustAsk.length === 0 ? (
            <Muted>
              Withholding will be worked out from {chosen.item_name} and the last day of treatment.
            </Muted>
          ) : null}

          {mustAsk.length > 0 && !noneRequired ? (
            <>
              {mustAsk.includes("meat") ? (
                <>
                  <FieldLabel>Meat withheld until</FieldLabel>
                  <Field
                    value={meatUntil}
                    onChangeText={setMeatUntil}
                    placeholder="2026-09-07"
                    autoCapitalize="none"
                  />
                </>
              ) : null}
              {mustAsk.includes("milk") ? (
                <>
                  <FieldLabel>Milk withheld until</FieldLabel>
                  <Field
                    value={milkUntil}
                    onChangeText={setMilkUntil}
                    placeholder="2026-08-17"
                    autoCapitalize="none"
                  />
                </>
              ) : null}
              {mustAsk.includes("eggs") ? (
                <>
                  <FieldLabel>Eggs withheld until</FieldLabel>
                  <Field
                    value={eggsUntil}
                    onChangeText={setEggsUntil}
                    placeholder="2026-08-17"
                    autoCapitalize="none"
                  />
                </>
              ) : null}
            </>
          ) : null}

          {required.length > 0 ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: noneRequired }}
              style={styles.assert}
              onPress={() => setNoneRequired(!noneRequired)}
            >
              <Ionicons
                name={noneRequired ? "checkbox" : "square-outline"}
                size={20}
                color={noneRequired ? palette.amber : palette.quiet}
              />
              <Text style={styles.assertText}>
                This product needs no withholding. I am stating that deliberately.
              </Text>
            </Pressable>
          ) : null}

          {error ? <ErrorText>{error}</ErrorText> : null}
          <PrimaryButton
            label={busy ? "Recording…" : "Record treatment"}
            disabled={busy}
            onPress={() => void record()}
          />
        </>
      ) : null}

      {!editable && treatments.length === 0 ? <Muted>No treatments were recorded.</Muted> : null}
    </Collapsible>
  );
}

/** The banner a folder carries while anything is still being withheld. */
export function WithholdingBanner({ patientId }: { patientId: string }) {
  const { data } = useQuery<TreatmentRow[]>(async () => {
    const { data: rows } = await supabase
      .from("treatments")
      .select(
        "id, product_name, dose_value, dose_unit, route, administered_at, duration_days, animals_treated, meat_withhold_until, milk_withhold_until, eggs_withhold_until, withdrawal_source"
      )
      .eq("patient_id", patientId)
      .is("deleted_at", null)
      .order("administered_at", { ascending: false });
    return (rows ?? []) as TreatmentRow[];
  }, [patientId]);

  const treatments = data ?? [];
  // The latest date per kind, because two overlapping courses mean the longer
  // one governs.
  const latest = (pick: (t: TreatmentRow) => string | null): string | null =>
    treatments
      .map(pick)
      .filter((value): value is string => value !== null && stillWithheld(value))
      .sort()
      .pop() ?? null;

  const meat = latest((t) => t.meat_withhold_until);
  const milk = latest((t) => t.milk_withhold_until);
  const eggs = latest((t) => t.eggs_withhold_until);
  if (!meat && !milk && !eggs) return null;

  return (
    <Card>
      <View style={styles.bannerHead}>
        <Ionicons name="warning" size={20} color={palette.amber} />
        <Text style={styles.bannerTitle}>Withholding in force</Text>
      </View>
      {milk ? <Text style={styles.bannerLine}>Milk until {formatDay(milk)}</Text> : null}
      {eggs ? <Text style={styles.bannerLine}>Eggs until {formatDay(eggs)}</Text> : null}
      {meat ? <Text style={styles.bannerLine}>Meat until {formatDay(meat)}</Text> : null}
      <Muted>Nothing from this animal may enter the food chain before these dates.</Muted>
    </Card>
  );
}

const styles = StyleSheet.create({
  given: {
    gap: 2,
    paddingVertical: space.md,
    borderBottomWidth: hairline,
    borderBottomColor: palette.line
  },
  givenWithheld: {
    backgroundColor: palette.amberSoft,
    borderRadius: radiusControl,
    paddingHorizontal: space.md,
    borderBottomWidth: 0
  },
  product: { ...type.strong, fontSize: 15, color: palette.ink },
  detail: { ...type.small, fontSize: 12, color: palette.quiet },
  withheld: { ...type.small, fontSize: 12, color: palette.quiet },
  withheldActive: { fontFamily: fonts.semibold, color: palette.amber },
  pairRow: { flexDirection: "row", gap: space.md },
  pairCell: { flex: 1, gap: space.xs },
  assert: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  assertText: { ...type.small, fontSize: 12, color: palette.ink, flex: 1 },
  bannerHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  bannerTitle: { ...type.strong, color: palette.amber },
  bannerLine: { fontFamily: fonts.semibold, fontSize: 15, color: palette.ink }
});
