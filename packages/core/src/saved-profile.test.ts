import { describe, expect, it } from "vitest";
import type { TaskAxes } from "@mandat/contract";
import { axesKey, savedProfileName } from "./saved-profile.js";

// D-552: an "Other" profile that ended in a delivered job is kept with a name; the next task with the same axes (size
// aside: it only changes the pilot) finds it by a stable key.
const axes: TaskAxes = { code: "existing", reference: "none", divisible: "yes", proof: ["tests", "numbers"], risk: { level: "low", outward: false }, size: "m" };

describe("saved profiles (D-552)", () => {
  it("the key ignores size and the order of the proofs; any other axis changes it", () => {
    expect(axesKey({ ...axes, size: "xl", proof: ["numbers", "tests"] })).toBe(axesKey(axes));
    expect(axesKey({ ...axes, divisible: "no" })).not.toBe(axesKey(axes));
    expect(axesKey({ ...axes, reference: { kind: "standard", locator: "RFC 9110" } })).toBe(axesKey({ ...axes, reference: { kind: "standard", locator: "another" } }));
    expect(axesKey({ ...axes, risk: { level: "high", outward: false } })).not.toBe(axesKey(axes));
  });
  it("the key is null while an axis that matters is unknown", () => {
    expect(axesKey({ ...axes, code: "unknown" })).toBeNull();
    expect(axesKey({ ...axes, proof: "unknown" })).toBeNull();
    expect(axesKey({ ...axes, size: "unknown" })).not.toBeNull();
  });
  it("the name is the goal on one line, at most 80 characters", () => {
    expect(savedProfileName("  Move the  reports\nto the new API  ")).toBe("Move the reports to the new API");
    expect(savedProfileName("x".repeat(200))).toHaveLength(80);
  });
});
