import { describe, expect, it } from "vitest";
import {
  VISIT_DRAFT_FIELDS,
  buildResolvedPayload,
  diffFields,
  isFullyResolved,
  normaliseValue,
  type FieldSpec,
  type Resolution
} from "./diff";

const FIELDS: FieldSpec[] = [
  { param: "p_chief_complaint", column: "chief_complaint", label: "Presenting complaint" },
  { param: "p_treatment_plan", column: "treatment_plan", label: "Treatment" },
  { param: "p_temperature_c", column: "temperature_c", label: "Temperature" }
];

describe("normaliseValue", () => {
  it("treats every way of writing nothing as the same", () => {
    // The RPCs collapse blanks to null on write, so a device that sent "" and a
    // server holding null do not disagree. Showing that as a conflict would
    // teach the vet the screen cries wolf.
    expect(normaliseValue(null)).toBeNull();
    expect(normaliseValue(undefined)).toBeNull();
    expect(normaliseValue("")).toBeNull();
    expect(normaliseValue("   ")).toBeNull();
  });

  it("ignores surrounding whitespace when comparing prose", () => {
    expect(normaliseValue("  Limping  ")).toBe("Limping");
  });

  it("compares a number and its stored text form as equal", () => {
    expect(normaliseValue(38.6)).toBe("38.6");
    expect(normaliseValue("38.6")).toBe("38.6");
  });

  it("keeps zero, which is a real reading and not an absent one", () => {
    expect(normaliseValue(0)).toBe("0");
  });
});

describe("diffFields", () => {
  it("returns only the fields that genuinely disagree", () => {
    const conflicts = diffFields(
      {
        p_chief_complaint: "Limping on the left hind leg",
        p_treatment_plan: "Rest and NSAIDs",
        p_temperature_c: 38.6
      },
      {
        chief_complaint: "Limping on the left hind leg",
        treatment_plan: "Rest, NSAIDs, recheck in five days",
        temperature_c: 38.6
      },
      FIELDS
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.field.label).toBe("Treatment");
    expect(conflicts[0]?.local).toBe("Rest and NSAIDs");
    expect(conflicts[0]?.server).toBe("Rest, NSAIDs, recheck in five days");
  });

  it("reports nothing when the two versions agree", () => {
    const conflicts = diffFields(
      { p_chief_complaint: "Limping", p_treatment_plan: "", p_temperature_c: 38.6 },
      { chief_complaint: "Limping", treatment_plan: null, temperature_c: "38.6" },
      FIELDS
    );
    expect(conflicts).toEqual([]);
  });

  it("reports a field the other device filled in and this one left blank", () => {
    const conflicts = diffFields(
      { p_treatment_plan: null },
      { treatment_plan: "Rest for ten days" },
      [FIELDS[1] as FieldSpec]
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.local).toBeNull();
    expect(conflicts[0]?.server).toBe("Rest for ten days");
  });

  it("covers every editable consultation field", () => {
    // A field missing from the spec would be invisible on the conflict screen,
    // so a disagreement about it would resolve silently in whichever direction
    // the payload happened to carry.
    expect(VISIT_DRAFT_FIELDS).toHaveLength(18);
    const params = new Set(VISIT_DRAFT_FIELDS.map((field) => field.param));
    expect(params.size).toBe(VISIT_DRAFT_FIELDS.length);
  });
});

describe("buildResolvedPayload", () => {
  const local = {
    p_id: "v-1",
    p_chief_complaint: "Limping",
    p_treatment_plan: "Rest and NSAIDs"
  };
  const server = {
    chief_complaint: "Limping",
    treatment_plan: "Rest, NSAIDs, recheck in five days"
  };

  it("keeps the local text when the vet chooses their own", () => {
    const conflicts = diffFields(local, server, FIELDS);
    const resolved = buildResolvedPayload(local, server, conflicts, {
      p_treatment_plan: "keep_local"
    });
    expect(resolved.p_treatment_plan).toBe("Rest and NSAIDs");
  });

  it("takes the server text when the vet chooses the other device", () => {
    const conflicts = diffFields(local, server, FIELDS);
    const resolved = buildResolvedPayload(local, server, conflicts, {
      p_treatment_plan: "keep_server"
    });
    expect(resolved.p_treatment_plan).toBe("Rest, NSAIDs, recheck in five days");
  });

  it("combines by choosing per field, taking one from each side", () => {
    const twoWayLocal = { p_chief_complaint: "Limping badly", p_treatment_plan: "Rest" };
    const twoWayServer = {
      chief_complaint: "Limping on the left hind",
      treatment_plan: "Rest and recheck"
    };
    const conflicts = diffFields(twoWayLocal, twoWayServer, FIELDS);
    expect(conflicts).toHaveLength(2);

    const resolved = buildResolvedPayload(twoWayLocal, twoWayServer, conflicts, {
      p_chief_complaint: "keep_server",
      p_treatment_plan: "keep_local"
    });

    expect(resolved.p_chief_complaint).toBe("Limping on the left hind");
    expect(resolved.p_treatment_plan).toBe("Rest");
  });

  it("leaves fields that were never in conflict exactly as they were", () => {
    const conflicts = diffFields(local, server, FIELDS);
    const resolved = buildResolvedPayload(local, server, conflicts, {
      p_treatment_plan: "keep_server"
    });
    expect(resolved.p_id).toBe("v-1");
    expect(resolved.p_chief_complaint).toBe("Limping");
  });

  it("defaults an undecided field to the local value rather than dropping it", () => {
    // Sending the resolution with a field silently blanked would lose whichever
    // text the vet had not looked at yet.
    const conflicts = diffFields(local, server, FIELDS);
    const resolved = buildResolvedPayload(local, server, conflicts, {});
    expect(resolved.p_treatment_plan).toBe("Rest and NSAIDs");
  });
});

describe("isFullyResolved", () => {
  it("is false until every conflicting field has a decision", () => {
    const conflicts = diffFields(
      { p_chief_complaint: "a", p_treatment_plan: "b" },
      { chief_complaint: "x", treatment_plan: "y" },
      FIELDS
    );
    const partial: Record<string, Resolution> = { p_chief_complaint: "keep_local" };
    expect(isFullyResolved(conflicts, partial)).toBe(false);

    partial.p_treatment_plan = "keep_server";
    expect(isFullyResolved(conflicts, partial)).toBe(true);
  });

  it("is true when there is nothing to decide", () => {
    expect(isFullyResolved([], {})).toBe(true);
  });
});
