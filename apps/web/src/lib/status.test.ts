import { describe, expect, it } from "vitest";
import { CHECK_LABEL, groupOf, statusOf } from "./status";

const t = (o: Partial<Parameters<typeof statusOf>[0]>) => ({ state: "CREATED", last_result: null, wait_reason: null, approval_needed: false, approved_by_human: false, ...o });

// D-292: one plain status per task (no state machine words on the screen) and three groups on the start page.
describe("status (D-292)", () => {
  it("each state → one status word and a sentence", () => {
    expect(statusOf(t({ state: "CREATED" })).key).toBe("queued");
    expect(statusOf(t({ state: "RUNNING" })).key).toBe("running");
    expect(statusOf(t({ state: "VERIFY_1" })).key).toBe("checking");
    expect(statusOf(t({ state: "HELD", last_result: "VERIFIED", wait_reason: "approval", approval_needed: true }))).toMatchObject({ key: "review", label: "Чака одобрение", tone: "green" });
    expect(statusOf(t({ state: "BLOCKED", last_result: "FAILED", wait_reason: "failed" }))).toMatchObject({ key: "failed", label: "Провал", tone: "red" });
    expect(statusOf(t({ state: "HELD", last_result: "UNKNOWN" })).key).toBe("unknown");
    expect(statusOf(t({ state: "HELD", last_result: "VERIFIED", wait_reason: "empty_change" })).key).toBe("empty");
    expect(statusOf(t({ state: "BLOCKED", wait_reason: "stopped" })).key).toBe("stopped");
    expect(statusOf(t({ state: "DELIVERED", last_result: "VERIFIED", approved_by_human: true })).key).toBe("approved");
    expect(statusOf(t({ state: "CLOSED", last_result: "VERIFIED" })).key).toBe("closed");
    expect(statusOf(t({ state: "GATED", last_result: "VERIFIED", approved_by_human: true })).key).toBe("approved");
    for (const s of ["queued", "running", "checking", "review", "failed", "unknown", "empty", "stopped", "approved", "closed"] as const) expect(statusOf(t(stateFor(s))).headline.length).toBeGreaterThan(10);
  });
  it("groups: Чака теб / В работа / Готово", () => {
    expect(groupOf("review")).toBe("waiting");
    expect(groupOf("failed")).toBe("waiting");
    expect(groupOf("unknown")).toBe("waiting");
    expect(groupOf("empty")).toBe("waiting");
    expect(groupOf("queued")).toBe("active");
    expect(groupOf("checking")).toBe("active");
    expect(groupOf("approved")).toBe("done");
    expect(groupOf("stopped")).toBe("done");
  });
  it("every detector the verdict writes has a plain label", () => {
    for (const d of ["D1.base_tests", "D2.inventory", "D3.protected", "D4.contract", "D10.lockfile", "MUST_PASS", "EXPORT", "INTEGRITY", "CANARY"]) expect(CHECK_LABEL[d]).toBeTruthy();
  });
});

function stateFor(k: string): Partial<Parameters<typeof statusOf>[0]> {
  const m: Record<string, Partial<Parameters<typeof statusOf>[0]>> = {
    queued: { state: "CREATED" }, running: { state: "RUNNING" }, checking: { state: "VERDICT" },
    review: { state: "HELD", last_result: "VERIFIED", wait_reason: "approval", approval_needed: true }, failed: { state: "BLOCKED", last_result: "FAILED" },
    unknown: { state: "HELD", last_result: "UNKNOWN" }, empty: { state: "HELD", last_result: "VERIFIED", wait_reason: "empty_change" },
    stopped: { state: "BLOCKED", wait_reason: "stopped" }, approved: { state: "DELIVERED", last_result: "VERIFIED", approved_by_human: true }, closed: { state: "CLOSED" },
  };
  return m[k] ?? {};
}
