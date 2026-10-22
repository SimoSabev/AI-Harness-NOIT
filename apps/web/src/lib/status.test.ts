import { describe, expect, it } from "vitest";
import { CHECK_LABEL, ago, checkLabel, groupOf, groupTitle, statusOf } from "./status";

const t = (o: Partial<Parameters<typeof statusOf>[0]>) => ({ state: "CREATED", last_result: null, wait_reason: null, approval_needed: false, approved_by_human: false, ...o });

// D-292: one plain status per task (no state machine words on the screen) and three groups on the start page.
describe("status (D-292)", () => {
  it("each state → one status word and a sentence", () => {
    expect(statusOf(t({ state: "CREATED" })).key).toBe("queued");
    expect(statusOf(t({ state: "RUNNING" })).key).toBe("running");
    expect(statusOf(t({ state: "VERIFY_1" })).key).toBe("checking");
    expect(statusOf(t({ state: "HELD", last_result: "VERIFIED", wait_reason: "approval", approval_needed: true }))).toMatchObject({ key: "review", label: "Awaiting approval", tone: "green" });
    expect(statusOf(t({ state: "BLOCKED", last_result: "FAILED", wait_reason: "failed" }))).toMatchObject({ key: "failed", label: "Failed", tone: "red" });
    expect(statusOf(t({ state: "BLOCKED", last_result: "FAILED" }), "bg")).toMatchObject({ key: "failed", label: "Провал" });
    expect(statusOf(t({ state: "HELD", last_result: "UNKNOWN" })).key).toBe("unknown");
    expect(statusOf(t({ state: "HELD", last_result: "VERIFIED", wait_reason: "empty_change" })).key).toBe("empty");
    expect(statusOf(t({ state: "BLOCKED", wait_reason: "stopped" })).key).toBe("stopped");
    expect(statusOf(t({ state: "DELIVERED", last_result: "VERIFIED", approved_by_human: true })).key).toBe("approved");
    expect(statusOf(t({ state: "CLOSED", last_result: "VERIFIED" })).key).toBe("closed");
    expect(statusOf(t({ state: "GATED", last_result: "VERIFIED", approved_by_human: true })).key).toBe("approved");
    expect(statusOf(t({ state: "HELD", last_result: "VERIFIED", wait_reason: "key_rejected" }))).toMatchObject({ key: "key", label: "Key rejected", tone: "red" });
    for (const s of ["queued", "running", "checking", "review", "failed", "unknown", "empty", "key", "stopped", "approved", "closed", "expired", "ask", "base"] as const) for (const lang of ["en", "bg"] as const) expect(statusOf(t(stateFor(s)), lang).headline.length).toBeGreaterThan(10);
  });
  it("E8g: a HELD task closed by the sweeper says so (gray, done)", () => {
    const st = statusOf(t({ state: "CLOSED", wait_reason: "expired" }));
    expect([st.key, st.tone]).toEqual(["expired", "gray"]);
    expect(groupOf(st.key)).toBe("done");
  });
  it("E8g: a task waiting for a tool permission is its own status (amber, waiting)", () => {
    const st = statusOf(t({ state: "HELD", last_result: "VERIFIED", wait_reason: "tool_approval" }));
    expect([st.key, st.tone, groupOf(st.key)]).toEqual(["ask", "amber", "waiting"]);
  });
  it("E8f: a change that conflicts with a moved base says so (amber, waiting)", () => {
    const st = statusOf(t({ state: "HELD", last_result: "VERIFIED", wait_reason: "base_moved" }));
    expect([st.key, st.tone, groupOf(st.key)]).toEqual(["base", "amber", "waiting"]);
  });
  it("groups: Чака теб / В работа / Готово", () => {
    expect(groupOf("review")).toBe("waiting");
    expect(groupOf("failed")).toBe("waiting");
    expect(groupOf("unknown")).toBe("waiting");
    expect(groupOf("empty")).toBe("waiting");
    expect(groupOf("key")).toBe("waiting");
    expect(groupOf("queued")).toBe("active");
    expect(groupOf("checking")).toBe("active");
    expect(groupOf("approved")).toBe("done");
    expect(groupOf("stopped")).toBe("done");
  });
  it("every detector the verdict writes has a plain label", () => {
    for (const d of ["D1.base_tests", "D2.inventory", "D3.protected", "D4.contract", "D10.lockfile", "MUST_PASS", "EXPORT", "INTEGRITY", "CANARY"]) expect(CHECK_LABEL[d]).toBeTruthy();
    expect(checkLabel("D2.inventory")).toBe("No test was deleted, skipped or weakened");
    expect(checkLabel("D2.inventory", "bg")).toBe("Никой тест не е изтрит, прескочен или отслабен");
    expect(checkLabel("D7.ci", "bg")).toBe("CI проверките");
    expect(checkLabel("X9")).toBe("X9");
    expect(groupTitle("waiting")).toBe("Waiting for you");
    expect(groupTitle("waiting", "bg")).toBe("Чака теб");
  });
});

describe("ago (E7е: Intl by locale)", () => {
  it("relative time in the chosen language", () => {
    const now = new Date("2026-10-21T18:00:00Z");
    expect(ago("2026-10-21T17:00:00Z", now)).toBe("1 hour ago");
    expect(ago("2026-10-21T17:00:00Z", now, "bg")).toBe("преди 1 час");
    expect(ago("2026-10-21T17:59:30Z", now)).toBe("30 seconds ago");
    expect(ago("2026-10-21T17:30:00Z", now)).toBe("30 minutes ago");
    expect(ago("2026-10-19T18:00:00Z", now)).toBe("2 days ago");
  });
});

function stateFor(k: string): Partial<Parameters<typeof statusOf>[0]> {
  const m: Record<string, Partial<Parameters<typeof statusOf>[0]>> = {
    queued: { state: "CREATED" }, running: { state: "RUNNING" }, checking: { state: "VERDICT" },
    review: { state: "HELD", last_result: "VERIFIED", wait_reason: "approval", approval_needed: true }, failed: { state: "BLOCKED", last_result: "FAILED" },
    unknown: { state: "HELD", last_result: "UNKNOWN" }, key: { state: "HELD", wait_reason: "key_rejected" }, empty: { state: "HELD", last_result: "VERIFIED", wait_reason: "empty_change" },
    stopped: { state: "BLOCKED", wait_reason: "stopped" }, approved: { state: "DELIVERED", last_result: "VERIFIED", approved_by_human: true }, closed: { state: "CLOSED" },
    expired: { state: "CLOSED", wait_reason: "expired" },
    ask: { state: "HELD", last_result: "VERIFIED", wait_reason: "tool_approval" },
    base: { state: "HELD", last_result: "VERIFIED", wait_reason: "base_moved" },
  };
  return m[k] ?? {};
}
