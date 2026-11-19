import { describe, expect, it } from "vitest";
import { translate } from "../i18n/t";
import type { Key, Params } from "../i18n/t";
import { taskTitle } from "./task-title";

// D-538 (live test 18.11): the internal tasks of a job (oracle, units, the final check) stay in the list, but with a short
// title from their data instead of their whole instruction text.
const en = (k: Key, p?: Params) => translate("en", k, p);
const bg = (k: Key, p?: Params) => translate("bg", k, p);
const goal = "Vector math for the engine: length, distance, normalize";

describe("taskTitle (D-538)", () => {
  it("an ordinary task keeps its text", () => {
    expect(taskTitle({ text: "Fix the VAT rounding", internal_role: null }, en)).toBe("Fix the VAT rounding");
  });
  it("the oracle, a unit and the final check get short titles from the spec's goal and the unit", () => {
    expect(taskTitle({ text: "Write hidden acceptance tests for the spec below…", internal_role: "oracle", spec_goal: goal }, en)).toBe(`Oracle · ${goal}`);
    expect(taskTitle({ text: "You build one unit of a larger job…", internal_role: "unit", unit_id: "u2", unit_title: "Vector length and distance", spec_goal: goal }, en)).toBe("Unit u2 · Vector length and distance");
    expect(taskTitle({ text: "Final check of job j_1: the whole change against the full oracle.", internal_role: "final", spec_goal: goal }, en)).toBe(`Final check · ${goal}`);
    expect(taskTitle({ text: "x", internal_role: "unit", unit_id: "u2", unit_title: "Vector length", spec_goal: goal }, bg)).toBe("Единица u2 · Vector length");
    expect(taskTitle({ text: "x", internal_role: "final", spec_goal: goal }, bg)).toBe(`Финална проверка · ${goal}`);
  });
  it("a long goal is clipped; a missing one leaves only the kind; never the instruction text", () => {
    const long = taskTitle({ text: "Write hidden acceptance tests for the spec below…", internal_role: "oracle", spec_goal: "g".repeat(300) }, en);
    expect(long.length).toBeLessThanOrEqual(100);
    expect(long.endsWith("…")).toBe(true);
    expect(taskTitle({ text: "Write hidden acceptance tests for the spec below…", internal_role: "oracle", spec_goal: null }, en)).toBe("Oracle");
    expect(taskTitle({ text: "You build one unit…", internal_role: "unit", unit_id: "u1", unit_title: null }, en)).toBe("Unit u1");
    expect(taskTitle({ text: "x", internal_role: "unit", unit_id: null, unit_title: "  a\nb  " }, en)).toBe("Unit · a b");
  });
});
