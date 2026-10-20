import { describe, expect, it } from "vitest";
import { deadlineFor, stateMaxMinutes, stepKey, sweepDecision } from "./lease.js";
import { assertTransition, canTransition } from "./state.js";

describe("lease (T3-8)", () => {
  it("просрочен VERIFY_1 без жив процес → UNKNOWN infra:lease_lost", () => {
    expect(sweepDecision({ task_id: "t_a", attempt: 1, state: "VERIFY_1", step: "verify", alive: false, hasVerdict: false })).toEqual({ kind: "verdict_unknown", task_id: "t_a", attempt: 1, reason: "infra:lease_lost" });
    expect(sweepDecision({ task_id: "t_a", attempt: 1, state: "VERIFY_1", step: "baseline", alive: false, hasVerdict: false }).kind).toBe("verdict_unknown");
  });
  it("просрочен RUNNING → BLOCKED runner_offline без присъда", () => {
    expect(sweepDecision({ task_id: "t_a", attempt: 2, state: "RUNNING", step: "agent_run", alive: false, hasVerdict: false })).toEqual({ kind: "blocked", task_id: "t_a", attempt: 2, reason: "runner_offline" });
    expect(sweepDecision({ task_id: "t_a", attempt: 1, state: "EXPORTING", step: "export", alive: false, hasVerdict: false }).kind).toBe("blocked");
  });
  it("никога повече от 1 присъда на опит; жив процес → удължава", () => {
    expect(sweepDecision({ task_id: "t_a", attempt: 1, state: "VERIFY_1", step: "verify", alive: false, hasVerdict: true }).kind).toBe("none");
    expect(sweepDecision({ task_id: "t_a", attempt: 1, state: "VERIFY_1", step: "verify", alive: true, hasVerdict: false }).kind).toBe("extend");
  });
  it("горни таймаути и MANDAT_STATE_MAX_MIN_<STATE>", () => {
    expect(stateMaxMinutes("VERIFY_1", {}, 30)).toBe(30);
    expect(stateMaxMinutes("VERIFY_2", {}, 30)).toBe(60);
    expect(stateMaxMinutes("RUNNING", {}, 45)).toBe(45);
    expect(stateMaxMinutes("PROVISIONING", { MANDAT_STATE_MAX_MIN_PROVISIONING: "3" }, 30)).toBe(3);
    expect(stateMaxMinutes("EXPORTING", { MANDAT_STATE_MAX_MIN_EXPORTING: "x" }, 30)).toBe(10);
    expect(deadlineFor("PUSHED", new Date(0), {}, 30).getTime()).toBe(30 * 60_000);
    expect(stepKey("t_a", 1, "verify", 2)).toBe("t_a:1:verify:2");
  });
  it("state machine: позволени и забранени преходи", () => {
    expect(canTransition("VERIFY_1", "VERDICT")).toBe(true);
    expect(canTransition("VERDICT", "DELIVERED")).toBe(false);
    expect(() => assertTransition("CLOSED", "CREATED")).toThrow(/illegal/);
    expect(() => assertTransition("GATED", "HELD")).not.toThrow();
  });
});
