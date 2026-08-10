import { describe, expect, it } from "vitest";
import { EXAM_SYSTEM_ORDER, examSystemRank, sortByExamOrder } from "./exam";

/** The eleven the database constrains system_name to. */
const DATABASE_SYSTEMS = [
  "General",
  "Cardiovascular",
  "Respiratory",
  "Gastrointestinal",
  "Musculoskeletal",
  "Integumentary",
  "Neurological",
  "Ocular",
  "Aural",
  "Urogenital",
  "Lymphatic"
];

describe("exam system order", () => {
  it("covers every system the database allows", () => {
    // A system missing here would sort to the end and quietly fall off the
    // bottom of the examination.
    for (const system of DATABASE_SYSTEMS) {
      expect(EXAM_SYSTEM_ORDER).toContain(system);
    }
    expect(EXAM_SYSTEM_ORDER).toHaveLength(DATABASE_SYSTEMS.length);
  });

  it("starts with the general impression, before the animal is touched", () => {
    expect(EXAM_SYSTEM_ORDER[0]).toBe("General");
  });

  it("works head to tail", () => {
    const rank = (system: string) => examSystemRank(system);
    // Head before chest.
    expect(rank("Ocular")).toBeLessThan(rank("Cardiovascular"));
    expect(rank("Aural")).toBeLessThan(rank("Respiratory"));
    // Chest before abdomen.
    expect(rank("Respiratory")).toBeLessThan(rank("Gastrointestinal"));
    // Abdomen before hindquarters.
    expect(rank("Gastrointestinal")).toBeLessThan(rank("Urogenital"));
    // Body before limbs.
    expect(rank("Urogenital")).toBeLessThan(rank("Musculoskeletal"));
  });

  it("is not the alphabetical order the database returns", () => {
    const alphabetical = [...DATABASE_SYSTEMS].sort((a, b) => a.localeCompare(b));
    expect([...EXAM_SYSTEM_ORDER]).not.toEqual(alphabetical);
    // The specific inversion that made this necessary.
    expect(examSystemRank("General")).toBeLessThan(examSystemRank("Aural"));
  });

  it("sorts findings into examination order", () => {
    const findings = [
      { system_name: "Urogenital" },
      { system_name: "General" },
      { system_name: "Respiratory" },
      { system_name: "Ocular" }
    ];
    expect(sortByExamOrder(findings).map((f) => f.system_name)).toEqual([
      "General",
      "Ocular",
      "Respiratory",
      "Urogenital"
    ]);
  });

  it("leaves the caller's array alone", () => {
    const findings = [{ system_name: "Urogenital" }, { system_name: "General" }];
    sortByExamOrder(findings);
    expect(findings.map((f) => f.system_name)).toEqual(["Urogenital", "General"]);
  });

  it("puts an unknown system last rather than at the head of the examination", () => {
    const findings = [{ system_name: "Dental" }, { system_name: "General" }];
    expect(sortByExamOrder(findings).map((f) => f.system_name)).toEqual(["General", "Dental"]);
  });

  it("keeps two unknown systems in a stable order", () => {
    const findings = [{ system_name: "Zoological" }, { system_name: "Dental" }];
    expect(sortByExamOrder(findings).map((f) => f.system_name)).toEqual(["Dental", "Zoological"]);
  });
});
