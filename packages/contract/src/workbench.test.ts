import { describe, expect, it } from "vitest";
import { AgentSessionWrite, NightRules, OpenWindowWrite, ResearchClaimWrite, ToolCallWrite, localUrl, redactSummary } from "./index.js";

describe("workbench (D-307)", () => {
  it("сесия на агент: подагент има родител; контекстът е 0..100; id s_…", () => {
    const s = { id: "s_cc3", task_id: "t_demo_1", parent_id: null, agent: "claude", model: "sonnet", account: "work", role: "lead", state: "running", step: "тестове 3/5", context_pct: 62, usd: 0.31, touching: ["src/signup.ts"] };
    expect(AgentSessionWrite.parse(s)).toMatchObject({ id: "s_cc3", role: "lead" });
    expect(() => AgentSessionWrite.parse({ ...s, context_pct: 120 })).toThrow();
    expect(() => AgentSessionWrite.parse({ ...s, id: "x" })).toThrow();
    expect(() => AgentSessionWrite.parse({ ...s, role: "subagent", parent_id: null })).toThrow();
    expect(() => AgentSessionWrite.parse({ ...s, touching: ["../etc/passwd"] })).toThrow();
  });
  it("повикване на инструмент: вид, решение на вратата; обобщението е без тайни и ≤ 300 знака", () => {
    const c = ToolCallWrite.parse({ session_id: "s_cc3", kind: "mcp", tool: "github.get_issue", summary: "issue #407 token=ghp_abcdefghijklmnopqrstuvwxyz0123456789", decision: "allowed", duration_ms: 12 });
    expect(c.summary).not.toContain("ghp_");
    expect(redactSummary("a".repeat(500))).toHaveLength(300);
    expect(() => ToolCallWrite.parse({ ...c, kind: "telepathy" })).toThrow();
  });
  it("отворен прозорец: само localhost адрес", () => {
    expect(localUrl("http://localhost:5173/signup")).toBe(true);
    expect(localUrl("http://127.0.0.1:8080")).toBe(true);
    expect(localUrl("https://evil.example")).toBe(false);
    expect(() => OpenWindowWrite.parse({ kind: "preview", title: "shop", url: "https://evil.example" })).toThrow();
    expect(OpenWindowWrite.parse({ kind: "terminal", title: "shop · claude #3", url: null }).kind).toBe("terminal");
  });
  it("правила на нощта: разумни граници и забранени инструменти", () => {
    const r = NightRules.parse({ auto_merge: { min_level: 3, max_lines: 80 }, on_fail: "retry_once", same_file: "wait", forbid_tools: ["stripe.*", "postgres.write"] });
    expect(r.on_fail).toBe("retry_then_park"); // D-320
    expect(() => NightRules.parse({ ...r, auto_merge: { min_level: 5, max_lines: 80 } })).toThrow();
  });
  it("твърдение от ресърч: препратките са към номера на източници", () => {
    expect(ResearchClaimWrite.parse({ text: "x", verdict: "conflict", source_ns: [2, 4] }).source_ns).toEqual([2, 4]);
    expect(() => ResearchClaimWrite.parse({ text: "x", verdict: "maybe", source_ns: [] })).toThrow();
  });
});

describe("night shift v5 (2.4, D-320)", () => {
  it("on_fail is retry_then_park; old values read as it; retries default 1", async () => {
    const { NightRules, NightQuestion } = await import("./index.js");
    const r = NightRules.parse({ auto_merge: { min_level: 3, max_lines: 80 }, on_fail: "retry_once", same_file: "wait", forbid_tools: [] });
    expect(r.on_fail).toBe("retry_then_park");
    expect(r.retries).toBe(1);
    expect(() => NightRules.parse({ ...r, retries: 4 })).toThrow();
    const q = NightQuestion.parse({ shift_id: "11111111-1111-4111-8111-111111111111", task_id: "t_n1", what_stopped: "D4 outside allowed paths", tried: ["attempt 1"], proposal: "add src/x to allowed_paths", status: "open", answer: null });
    expect(q.status).toBe("open");
    expect(() => NightQuestion.parse({ ...q, status: "maybe" })).toThrow();
  });
});

describe("evidence and ledger kinds v5 (2.6)", () => {
  it("new detectors, ledger kinds and security event kinds", async () => {
    const { DetectorId, LedgerKind, SecurityEventKind } = await import("./index.js");
    for (const d of ["D5.hidden", "D8.static", "D12.ui", "RESEARCH", "REVIEW"]) expect(DetectorId.parse(d)).toBe(d);
    for (const k of ["profile_change", "role_change", "tool_permission", "mcp_change", "night_question", "research_run", "conflict", "parked"]) expect(LedgerKind.parse(k)).toBe(k);
    for (const k of ["tool_poisoning", "mcp_definition_changed", "ask_denied", "conflict_file", "config_change"]) expect(SecurityEventKind.parse(k)).toBe(k);
  });
});
