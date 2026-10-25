import { describe, expect, it } from "vitest";
import { CHECK_LABEL, actionsOf, ago, checkLabel, groupOf, groupTitle, outcomeTone, statusOf } from "./status";

const t = (o: Partial<Parameters<typeof statusOf>[0]>) => ({ state: "CREATED", last_result: null, wait_reason: null, approval_needed: false, approved_by_human: false, ...o });

// D-292: one plain status per task (no state machine words on the screen) and three groups on the start page.
describe("status (D-292)", () => {
  it("each state → one status word and a sentence", () => {
    expect(statusOf(t({ state: "CREATED" })).key).toBe("queued");
    expect(statusOf(t({ state: "RUNNING" })).key).toBe("running");
    expect(statusOf(t({ state: "VERIFY_1" })).key).toBe("checking");
    expect(statusOf(t({ state: "HELD", last_result: "VERIFIED", wait_reason: "approval", approval_needed: true }))).toMatchObject({ key: "review", label: "Awaiting approval", tone: "amber" });
    expect(statusOf(t({ state: "BLOCKED", last_result: "FAILED", wait_reason: "failed" }))).toMatchObject({ key: "failed", label: "Failed", tone: "red" });
    expect(statusOf(t({ state: "BLOCKED", last_result: "FAILED" }), "bg")).toMatchObject({ key: "failed", label: "Провал" });
    expect(statusOf(t({ state: "HELD", last_result: "UNKNOWN" })).key).toBe("unknown");
    expect(statusOf(t({ state: "HELD", last_result: "VERIFIED", wait_reason: "empty_change" })).key).toBe("empty");
    expect(statusOf(t({ state: "BLOCKED", wait_reason: "stopped" })).key).toBe("stopped");
    expect(statusOf(t({ state: "DELIVERED", last_result: "VERIFIED", approved_by_human: true })).key).toBe("approved");
    expect(statusOf(t({ state: "CLOSED", last_result: "VERIFIED" })).key).toBe("closed");
    expect(statusOf(t({ state: "GATED", last_result: "VERIFIED", approved_by_human: true })).key).toBe("approved");
    expect(statusOf(t({ state: "HELD", last_result: "VERIFIED", wait_reason: "key_rejected" }))).toMatchObject({ key: "key", label: "Key rejected", tone: "red" });
    for (const s of ["queued", "running", "checking", "review", "failed", "unknown", "empty", "key", "stopped", "approved", "applied", "closed", "expired", "ask", "base", "ci"] as const) for (const lang of ["en", "bg"] as const) expect(statusOf(t(stateFor(s)), lang).headline.length).toBeGreaterThan(10);
  });
  it("D-367: a change that went into main by itself → applied (green, done); approved by a person stays approved", () => {
    const st = statusOf(t({ state: "CLOSED", last_result: "VERIFIED", delivered: "merge" }));
    expect([st.key, st.tone, st.label]).toEqual(["applied", "green", "Added automatically"]);
    expect(statusOf(t({ state: "CLOSED", last_result: "VERIFIED", delivered: "merge" }), "bg").label).toBe("Добавена автоматично");
    expect(groupOf(st.key)).toBe("done");
    expect(statusOf(t({ state: "CLOSED", last_result: "VERIFIED", delivered: "merge", approved_by_human: true })).key).toBe("approved");
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
    for (const d of ["D1.base_tests", "D2.inventory", "D3.protected", "D4.contract", "D10.lockfile", "MUST_PASS", "EXPORT", "INTEGRITY", "CANARY", "D11.mutation", "D5.hidden", "D8.static", "D12.ui", "REVIEW"]) expect(CHECK_LABEL[d]).toBeTruthy();
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
    stopped: { state: "BLOCKED", wait_reason: "stopped" }, approved: { state: "DELIVERED", last_result: "VERIFIED", approved_by_human: true }, applied: { state: "CLOSED", last_result: "VERIFIED", delivered: "merge" }, closed: { state: "CLOSED" },
    expired: { state: "CLOSED", wait_reason: "expired" },
    ask: { state: "HELD", last_result: "VERIFIED", wait_reason: "tool_approval" },
    base: { state: "HELD", last_result: "VERIFIED", wait_reason: "base_moved" },
    ci: { state: "HELD", last_result: "VERIFIED", wait_reason: "ci_failed" },
  };
  return m[k] ?? {};
}

// D-386: a task that waits for the person is amber in every list; the box under it takes the colour of the verdict.
describe("waiting on you, the verdict box, the actions (D-386)", () => {
  it("every status that waits for the person is amber or red, never green", () => {
    for (const k of ["review", "unknown", "empty", "ask", "base"] as const) expect(statusOf(t(stateFor(k))).tone, k).toBe("amber");
    for (const k of ["failed", "key", "ci"] as const) expect(statusOf(t(stateFor(k))).tone, k).toBe("red");
  });
  it("the verdict box is green for VERIFIED, red for FAILED, amber for UNKNOWN; without a verdict the status tone", () => {
    expect(outcomeTone("VERIFIED", "amber")).toBe("green");
    expect(outcomeTone("FAILED", "red")).toBe("red");
    expect(outcomeTone("UNKNOWN", "amber")).toBe("amber");
    expect(outcomeTone(null, "gray")).toBe("gray");
  });
  it("review: approve, reject, send back with a note; a failure: run again, with an optional note; running: stop", () => {
    expect(actionsOf("review")).toEqual({ decide: true, again: false, note: true, fixCi: false, stop: false });
    for (const k of ["failed", "unknown", "empty", "base"] as const) expect(actionsOf(k), k).toEqual({ decide: false, again: true, note: true, fixCi: false, stop: false });
    expect(actionsOf("key")).toEqual({ decide: false, again: true, note: false, fixCi: false, stop: false });
    expect(actionsOf("ci")).toEqual({ decide: false, again: false, note: true, fixCi: true, stop: false });
    for (const k of ["queued", "running", "checking"] as const) expect(actionsOf(k).stop, k).toBe(true);
    for (const k of ["approved", "applied", "closed", "expired", "stopped", "ask"] as const) expect(Object.values(actionsOf(k)).some(Boolean), k).toBe(false);
  });
});
