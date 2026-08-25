import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  defaultRouteFor,
  dueState,
  routeLabel,
  routesFor,
  suggestedNextDue,
  vaccineLabel,
  vaccinesForSpecies,
  PARASITE_TARGETS,
  parasiteLabel,
  type PreventiveKind
} from "@vetkeep/domain";
import { definedArgs, optionalNumber, optionalText } from "@vetkeep/contracts";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@/features/practice/use-query";
import { FieldLabel, Muted, Segmented } from "@/ui/practice-components";
import { Collapsible, OptionChips } from "@/ui/elements";
import { ErrorText, Field, PrimaryButton } from "@/ui/components";
import { fonts, hairline, palette, radiusControl, radiusPill, space, type } from "@/ui/tokens";

/**
 * Vaccination and deworming on a folder.
 *
 * One section rather than two, because the vet's question is the same for both:
 * what has this animal had, and what is due. What differs is only that a
 * vaccine is chosen from a list and a dewormer is typed.
 */

type PreventiveRow = {
  id: string;
  kind: string;
  target_parasites: string[] | null;
  vaccine_type: string | null;
  product_name: string;
  manufacturer: string | null;
  batch_lot_number: string | null;
  dose: string | null;
  animals_treated: number | null;
  date_given: string;
  next_due_date: string | null;
};

const KINDS = [
  { value: "vaccination", label: "Vaccination" },
  { value: "deworming", label: "Deworming" },
  // Shortened deliberately: "Tick, flea and mite control" does not fit a chip.
  { value: "ectoparasite_control", label: "Ticks and fleas" }
];

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDay(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export function PreventiveSection({
  patientId,
  species,
  isGroup
}: {
  patientId: string;
  species: string;
  isGroup: boolean;
}) {
  const [kind, setKind] = useState("vaccination");
  const [parasites, setParasites] = useState<string[]>([]);
  const [vaccineType, setVaccineType] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [batch, setBatch] = useState("");
  const [dose, setDose] = useState("");
  const [route, setRoute] = useState<string>(defaultRouteFor({ kind: "vaccination", isGroup }));
  const [animalsTreated, setAnimalsTreated] = useState("");
  const [dateGiven, setDateGiven] = useState(isoToday());
  const [nextDue, setNextDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, reload } = useQuery<PreventiveRow[]>(async () => {
    const { data: rows, error: queryError } = await supabase
      .from("preventive_care")
      .select(
        "id, kind, vaccine_type, product_name, manufacturer, batch_lot_number, dose, animals_treated, date_given, next_due_date, target_parasites"
      )
      .eq("patient_id", patientId)
      .is("deleted_at", null)
      .order("date_given", { ascending: false });
    if (queryError) throw new Error("Could not load the vaccination history.");
    return (rows ?? []) as PreventiveRow[];
  }, [patientId]);

  const history = data ?? [];
  const outstanding = history.filter((entry) => {
    const state = dueState(entry.next_due_date);
    return state === "overdue" || state === "due_soon";
  });

  const isVaccination = kind === "vaccination";
  const isParasiteControl = kind === "ectoparasite_control";
  const vaccines = vaccinesForSpecies(species);
  const routes = routesFor({ kind: kind as PreventiveKind, isGroup });

  /**
   * A vaccine is injected and a wormer is swallowed, so the route carried over
   * from the other kind is usually wrong. It is only replaced when it does not
   * belong to the new list, which leaves a deliberate choice alone.
   */
  function chooseKind(next: string) {
    setKind(next);
    const nextKind = next as PreventiveKind;
    const allowed = routesFor({ kind: nextKind, isGroup });
    if (!allowed.includes(route as (typeof allowed)[number])) {
      setRoute(defaultRouteFor({ kind: nextKind, isGroup }));
    }
  }

  /**
   * The usual interval, offered when the vaccine is chosen. A suggestion the
   * vet overwrites freely: intervals move with the product, the age of the
   * animal, and whether this is a primary course or a booster.
   */
  function chooseVaccine(next: string) {
    setVaccineType(next);
    const suggested = suggestedNextDue(next, new Date(`${dateGiven}T00:00:00Z`));
    if (suggested) setNextDue(suggested.toISOString().slice(0, 10));
  }

  function reset() {
    setVaccineType(null);
    setProductName("");
    setManufacturer("");
    setBatch("");
    setDose("");
    setAnimalsTreated("");
    setDateGiven(isoToday());
    setNextDue("");
  }

  async function record() {
    setError(null);
    if (isVaccination && !vaccineType) {
      setError("Choose which vaccine was given.");
      return;
    }
    if (productName.trim() === "") {
      setError(
        isVaccination
          ? "Name the brand that was used."
          : isParasiteControl
            ? "Name the product used."
            : "Name the dewormer used."
      );
      return;
    }

    setBusy(true);
    const { error: rpcError } = await supabase.rpc(
      "record_preventive_care",
      definedArgs({
        p_id: globalThis.crypto.randomUUID(),
        p_patient_id: patientId,
        p_kind: kind,
        p_product_name: productName,
        p_date_given: dateGiven,
        p_vaccine_type: isVaccination ? (vaccineType ?? undefined) : undefined,
        p_manufacturer: optionalText(manufacturer),
        p_batch_lot_number: optionalText(batch),
        p_dose: optionalText(dose),
        p_route: route,
        p_animals_treated: isGroup ? optionalNumber(animalsTreated) : undefined,
        p_next_due_date: optionalText(nextDue),
        // Only ever sent for parasite control; the server refuses it otherwise.
        p_target_parasites: isParasiteControl && parasites.length > 0 ? parasites : undefined
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
      title="Vaccination, worming and parasites"
      icon="shield-checkmark"
      hint={
        outstanding.length > 0
          ? `${outstanding.length} due`
          : history.length === 0
            ? "None recorded"
            : `${history.length} recorded`
      }
      tone={outstanding.length > 0 ? "warn" : "good"}
    >
      {outstanding.length > 0 ? (
        <View style={styles.due}>
          <Ionicons name="alarm" size={18} color={palette.amber} />
          <View style={styles.dueBody}>
            {outstanding.map((entry) => (
              <Text key={entry.id} style={styles.dueLine}>
                {entry.vaccine_type ? vaccineLabel(entry.vaccine_type) : entry.product_name}
                {" — "}
                {dueState(entry.next_due_date) === "overdue" ? "overdue since " : "due "}
                {formatDay(entry.next_due_date as string)}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {history.map((entry) => (
        <View key={entry.id} style={styles.entry}>
          <View style={styles.entryHead}>
            <Text style={styles.entryTitle}>
              {entry.vaccine_type ? vaccineLabel(entry.vaccine_type) : entry.product_name}
            </Text>
            <View style={[styles.tag, entry.kind === "deworming" && styles.tagWorm]}>
              <Text style={styles.tagText}>
                {entry.kind === "vaccination"
                  ? "Vaccine"
                  : entry.kind === "deworming"
                    ? "Dewormer"
                    : "Parasite control"}
              </Text>
            </View>
          </View>
          <Text style={styles.entryMeta}>
            {formatDay(entry.date_given)}
            {entry.vaccine_type ? ` · ${entry.product_name}` : ""}
            {entry.manufacturer ? ` · ${entry.manufacturer}` : ""}
            {entry.dose ? ` · ${entry.dose}` : ""}
            {entry.animals_treated ? ` · ${entry.animals_treated} animals` : ""}
          </Text>
          {entry.batch_lot_number ? (
            <Text style={styles.entryBatch}>Batch {entry.batch_lot_number}</Text>
          ) : null}
          {entry.next_due_date ? (
            <Text style={styles.entryMeta}>Next due {formatDay(entry.next_due_date)}</Text>
          ) : null}
        </View>
      ))}

      {history.length === 0 ? <Muted>Nothing recorded yet for this animal.</Muted> : null}

      <FieldLabel>Record</FieldLabel>
      <Segmented
        options={KINDS}
        value={kind}
        onChange={chooseKind}
        accessibilityLabel="What kind"
      />

      {isParasiteControl ? (
        <>
          <FieldLabel>What is being treated</FieldLabel>
          {/* Multi-select, unlike the vaccine picker: one spot-on routinely
              covers ticks and fleas together, and recording only one of them
              would misstate what the animal is protected against. */}
          <View style={styles.parasiteRow}>
            {PARASITE_TARGETS.map((target) => {
              const picked = parasites.includes(target);
              return (
                <Pressable
                  key={target}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: picked }}
                  accessibilityLabel={parasiteLabel(target)}
                  style={[styles.parasiteChip, picked && styles.parasiteChipOn]}
                  onPress={() =>
                    setParasites((current) =>
                      current.includes(target)
                        ? current.filter((entry) => entry !== target)
                        : [...current, target]
                    )
                  }
                >
                  <Text style={[styles.parasiteText, picked && styles.parasiteTextOn]}>
                    {parasiteLabel(target)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {isVaccination ? (
        <>
          <FieldLabel>Vaccine</FieldLabel>
          <OptionChips
            options={vaccines.map((profile) => ({ value: profile.value, label: profile.label }))}
            value={vaccineType}
            onChange={chooseVaccine}
            accessibilityLabel="Vaccine"
          />
        </>
      ) : null}

      <FieldLabel>
        {isVaccination ? "Brand" : isParasiteControl ? "Product used" : "Dewormer used"}
      </FieldLabel>
      <Field
        value={productName}
        onChangeText={setProductName}
        placeholder={
          isVaccination
            ? "Nobivac, Rabisin"
            : isParasiteControl
              ? "Frontline, Amitraz, Ivermectin"
              : "Albendazole, Ivermectin"
        }
      />

      {isVaccination ? (
        <>
          <FieldLabel>Manufacturer</FieldLabel>
          <Field value={manufacturer} onChangeText={setManufacturer} placeholder="Optional" />
        </>
      ) : null}

      <FieldLabel>Batch or serial number</FieldLabel>
      <Field
        value={batch}
        onChangeText={setBatch}
        placeholder="From the vial"
        autoCapitalize="characters"
      />

      <View style={styles.pairRow}>
        <View style={styles.pairCell}>
          <FieldLabel>How much given</FieldLabel>
          <Field
            value={dose}
            onChangeText={setDose}
            placeholder={isVaccination ? "1 ml" : "1 tablet per 10 kg"}
          />
        </View>
        {isGroup ? (
          <View style={styles.pairCell}>
            <FieldLabel>Animals done</FieldLabel>
            <Field
              value={animalsTreated}
              onChangeText={setAnimalsTreated}
              keyboardType="number-pad"
              placeholder="400"
            />
          </View>
        ) : null}
      </View>

      <FieldLabel>Route</FieldLabel>
      <Segmented
        options={routes.map((value) => ({ value, label: routeLabel(value) }))}
        value={route}
        onChange={setRoute}
        accessibilityLabel="Route"
      />

      <View style={styles.pairRow}>
        <View style={styles.pairCell}>
          <FieldLabel>Date given</FieldLabel>
          <Field
            value={dateGiven}
            onChangeText={setDateGiven}
            placeholder="2026-08-10"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.pairCell}>
          <FieldLabel>Next due</FieldLabel>
          <Field
            value={nextDue}
            onChangeText={setNextDue}
            placeholder="2027-08-10"
            autoCapitalize="none"
          />
        </View>
      </View>

      {error ? <ErrorText>{error}</ErrorText> : null}
      <PrimaryButton
        label={busy ? "Recording…" : "Record"}
        disabled={busy}
        onPress={() => void record()}
      />
    </Collapsible>
  );
}

const styles = StyleSheet.create({
  parasiteRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  parasiteChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radiusPill,
    borderWidth: hairline,
    borderColor: palette.line,
    backgroundColor: palette.surface
  },
  parasiteChipOn: { backgroundColor: palette.brandSoft, borderColor: palette.brand },
  parasiteText: { ...type.small, fontSize: 12, color: palette.quiet },
  parasiteTextOn: { color: palette.brandInk, fontFamily: fonts.semibold },
  due: {
    flexDirection: "row",
    gap: space.md,
    backgroundColor: palette.amberSoft,
    borderRadius: radiusControl,
    borderLeftWidth: 4,
    borderLeftColor: palette.amber,
    padding: space.md
  },
  dueBody: { flex: 1, gap: 2 },
  dueLine: { fontFamily: fonts.semibold, fontSize: 13, color: palette.amber },
  entry: {
    gap: 2,
    paddingVertical: space.md,
    borderBottomWidth: hairline,
    borderBottomColor: palette.line
  },
  entryHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
  entryTitle: { ...type.strong, fontSize: 15, color: palette.ink, flex: 1 },
  entryMeta: { ...type.small, fontSize: 12, color: palette.quiet },
  entryBatch: { fontFamily: fonts.mono, fontSize: 11, color: palette.quiet },
  tag: {
    backgroundColor: palette.brandSoft,
    borderRadius: radiusPill,
    paddingHorizontal: space.sm,
    paddingVertical: 2
  },
  tagWorm: { backgroundColor: palette.greenSoft },
  tagText: { fontFamily: fonts.semibold, fontSize: 10, color: palette.quiet },
  pairRow: { flexDirection: "row", gap: space.md },
  pairCell: { flex: 1, gap: space.xs }
});
