import { describe, expect, it } from "vitest";
import {
  TREATMENT_ROUTES,
  defaultTreatmentRoute,
  treatmentRouteLabel,
  treatmentRoutesFor
} from "./treatment";

describe("treatment routes", () => {
  it("never offers a route the database would refuse", () => {
    const cases = [
      { species: "dog", purpose: "pet", isGroup: false },
      { species: "cattle", purpose: "milk", isGroup: false },
      { species: "poultry", purpose: "eggs", isGroup: true },
      { species: "goat", purpose: "meat", isGroup: false },
      { species: "rabbit", purpose: "meat", isGroup: true }
    ];
    for (const input of cases) {
      for (const route of treatmentRoutesFor(input)) {
        expect(TREATMENT_ROUTES).toContain(route);
      }
    }
  });

  it("doses a group through the feed, the water or a spray", () => {
    const routes = treatmentRoutesFor({ species: "poultry", purpose: "eggs", isGroup: true });
    expect(routes).toContain("in_water");
    expect(routes).toContain("in_feed");
    expect(defaultTreatmentRoute({ species: "poultry", purpose: "eggs", isGroup: true })).toBe(
      "in_water"
    );
  });

  it("never offers intramammary to a group", () => {
    // The bug this test exists for. A tube goes into one quarter of one udder;
    // it is not something done to a flock.
    const routes = treatmentRoutesFor({ species: "cattle", purpose: "milk", isGroup: true });
    expect(routes).not.toContain("intramammary");
  });

  it("offers intramammary to a dairy cow, where mastitis is treated", () => {
    const routes = treatmentRoutesFor({ species: "cattle", purpose: "milk", isGroup: false });
    expect(routes).toContain("intramammary");
  });

  it("offers intramammary to a milking goat and ewe", () => {
    expect(treatmentRoutesFor({ species: "goat", purpose: "milk", isGroup: false })).toContain(
      "intramammary"
    );
    expect(treatmentRoutesFor({ species: "sheep", purpose: "milk", isGroup: false })).toContain(
      "intramammary"
    );
  });

  it("withholds intramammary from an animal that gives no milk", () => {
    // A tube has nowhere to go in a goat kept for meat, or in a dog.
    expect(treatmentRoutesFor({ species: "goat", purpose: "meat", isGroup: false })).not.toContain(
      "intramammary"
    );
    expect(treatmentRoutesFor({ species: "dog", purpose: "pet", isGroup: false })).not.toContain(
      "intramammary"
    );
    expect(treatmentRoutesFor({ species: "pig", purpose: "meat", isGroup: false })).not.toContain(
      "intramammary"
    );
  });

  it("starts an individual on an injection, which is the commonest case", () => {
    expect(defaultTreatmentRoute({ species: "dog", purpose: "pet", isGroup: false })).toBe("im");
    expect(defaultTreatmentRoute({ species: "cattle", purpose: "milk", isGroup: false })).toBe(
      "im"
    );
  });

  it("labels a route for reading", () => {
    expect(treatmentRouteLabel("intramammary")).toBe("Intramammary");
    expect(treatmentRouteLabel("in_feed")).toBe("In feed");
    expect(treatmentRouteLabel("unknown")).toBe("unknown");
  });
});
