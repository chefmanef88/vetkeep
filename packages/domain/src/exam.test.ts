import { describe, expect, it } from "vitest";
import { EXAM_SYSTEM_ORDER, examSystemRank, sortByExamOrder } from "./exam";

/** Everything the database constrains system_name to, across every species. */
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
  "Lymphatic",
  "Dental",
  "Beak and cere",
  "Crop",
  "Plumage",
  "Keel",
  "Vent",
  "Wings"
];

/** The sets the database seeds, mirrored so the ordering can be checked. */
const AVIAN_SET = [
  "General",
  "Beak and cere",
  "Ocular",
  "Crop",
  "Respiratory",
  "Plumage",
  "Keel",
  "Wings",
  "Vent",
  "Musculoskeletal",
  "Neurological"
];

const RABBIT_SET = [
  "General",
  "Ocular",
  "Aural",
  "Dental",
  "Cardiovascular",
  "Respiratory",
  "Gastrointestinal",
  "Urogenital",
  "Musculoskeletal",
  "Neurological",
  "Integumentary",
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
    const findings = [{ system_name: "Zoological" }, { system_name: "Aviary" }];
    expect(sortByExamOrder(findings).map((f) => f.system_name)).toEqual(["Aviary", "Zoological"]);
  });

  it("runs a bird beak to vent, not alphabetically", () => {
    const shuffled = [...AVIAN_SET]
      .sort((a, b) => a.localeCompare(b))
      .map((s) => ({
        system_name: s
      }));
    expect(sortByExamOrder(shuffled).map((f) => f.system_name)).toEqual([
      "General",
      "Beak and cere",
      "Ocular",
      "Crop",
      "Respiratory",
      "Keel",
      "Wings",
      "Vent",
      "Musculoskeletal",
      "Neurological",
      "Plumage"
    ]);
  });

  it("puts a rabbit's teeth with its head, where they are examined", () => {
    const shuffled = [...RABBIT_SET]
      .sort((a, b) => a.localeCompare(b))
      .map((s) => ({
        system_name: s
      }));
    const ordered = sortByExamOrder(shuffled).map((f) => f.system_name);
    expect(ordered.indexOf("Dental")).toBeLessThan(ordered.indexOf("Cardiovascular"));
    expect(ordered.indexOf("Aural")).toBeLessThan(ordered.indexOf("Dental"));
  });

  it("keeps the mammalian order it always had", () => {
    const rank = (system: string) => examSystemRank(system);
    expect(rank("General")).toBeLessThan(rank("Ocular"));
    expect(rank("Ocular")).toBeLessThan(rank("Cardiovascular"));
    expect(rank("Respiratory")).toBeLessThan(rank("Gastrointestinal"));
    expect(rank("Urogenital")).toBeLessThan(rank("Musculoskeletal"));
  });
});
