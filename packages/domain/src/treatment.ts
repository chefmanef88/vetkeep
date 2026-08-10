/**
 * How a treatment is given.
 *
 * A separate list from the preventive routes: a vaccine can go up a nostril or
 * through a wing web, and neither is a way to give an antibiotic. What a
 * treatment adds is intramammary, which is a tube into one quarter of one
 * udder — an individual act on a lactating animal, never something done to a
 * flock.
 *
 * Kept beside the species rules so the options a vet is offered cannot drift
 * from what the database will accept.
 */

export const TREATMENT_ROUTES = [
  "oral",
  "im",
  "iv",
  "sc",
  "topical",
  "intramammary",
  "in_water",
  "in_feed"
] as const;
export type TreatmentRoute = (typeof TREATMENT_ROUTES)[number];

const TREATMENT_ROUTE_LABELS: Record<TreatmentRoute, string> = {
  oral: "Oral",
  im: "IM",
  iv: "IV",
  sc: "SC",
  topical: "Topical",
  intramammary: "Intramammary",
  in_water: "In water",
  in_feed: "In feed"
};

export function treatmentRouteLabel(route: string): string {
  return TREATMENT_ROUTE_LABELS[route as TreatmentRoute] ?? route;
}

/** Species that can be treated through the udder. */
const DAIRY_SPECIES = ["cattle", "sheep", "goat"];

/**
 * The routes worth offering for this animal.
 *
 * A group is dosed through feed, water or a spray, because catching four
 * hundred birds to inject them individually is not what happened. An individual
 * is injected or dosed by mouth, and a lactating dairy animal adds intramammary
 * for mastitis — offered only there, since a tube of intramammary has nowhere
 * to go in a goat kept for meat.
 */
export function treatmentRoutesFor(input: {
  species: string;
  purpose: string;
  isGroup: boolean;
}): readonly TreatmentRoute[] {
  if (input.isGroup) return ["in_water", "in_feed", "topical", "oral"];

  const base: TreatmentRoute[] = ["im", "sc", "iv", "oral", "topical"];
  if (input.purpose === "milk" && DAIRY_SPECIES.includes(input.species)) {
    // Placed after the injectables rather than first: mastitis is common, but
    // not the commonest reason a cow is treated.
    base.splice(3, 0, "intramammary");
  }
  return base;
}

export function defaultTreatmentRoute(input: {
  species: string;
  purpose: string;
  isGroup: boolean;
}): TreatmentRoute {
  return treatmentRoutesFor(input)[0] ?? "im";
}
