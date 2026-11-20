import { describe, expect, it } from "vitest";
import { GATES, gateRows, strategyReasons } from "./job-strategy";

// D-558 (demo 4.12): why the job runs the way it does, in fixed sentences from the axes and the plan (never a model's
// text), and the gates of the final check with their status.
const axes = { code: "existing", reference: "none", divisible: "yes", proof: ["tests"], risk: { level: "low", outward: false }, size: "l" } as const;

describe("the job's strategy (D-558)", () => {
  it("the reasons follow the axes and the plan: divisible → waves, large → pilot, existing code → its tests stay green, hidden tests", () => {
    expect(strategyReasons({ axes, mode: "waves", pilot: 3, oracle: true })).toEqual(["job.why.waves", "job.why.pilot", "job.why.baseline", "job.why.hidden", "job.why.fresh"]);
    expect(strategyReasons({ axes: { ...axes, divisible: "no", size: "s" }, mode: "single", pilot: 0, oracle: true })).toEqual(["job.why.single", "job.why.baseline", "job.why.hidden", "job.why.fresh"]);
    expect(strategyReasons({ axes: { ...axes, risk: { level: "high", outward: true } }, mode: "waves", pilot: 0, oracle: false })).toEqual(["job.why.waves", "job.why.baseline", "job.why.risk", "job.why.fresh"]);
    expect(strategyReasons({ axes: null, mode: "single", pilot: 0, oracle: false })).toEqual(["job.why.single", "job.why.fresh"]);
  });
  it("every gate of the final check is listed in order; its status comes from the final verdict's evidence, else pending", () => {
    const rows = gateRows([{ detector: "D5.hidden", status: "pass" }, { detector: "D14.perf", status: "unknown" }, { detector: "D1.base_tests", status: "fail" }, { detector: "REVIEW", status: "pass" }]);
    expect(rows.map((r) => r.id)).toEqual([...GATES]);
    expect(rows.find((r) => r.id === "D5.hidden")?.status).toBe("pass");
    expect(rows.find((r) => r.id === "D1.base_tests")?.status).toBe("fail");
    expect(rows.find((r) => r.id === "D14.perf")?.status).toBe("unknown");
    expect(rows.find((r) => r.id === "D13.cheat")?.status).toBe("pending");
    expect(gateRows(null).every((r) => r.status === "pending")).toBe(true);
  });
});
