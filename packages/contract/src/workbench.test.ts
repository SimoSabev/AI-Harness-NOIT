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
    expect(r.on_fail).toBe("retry_once");
    expect(() => NightRules.parse({ ...r, auto_merge: { min_level: 5, max_lines: 80 } })).toThrow();
  });
  it("твърдение от ресърч: препратките са към номера на източници", () => {
    expect(ResearchClaimWrite.parse({ text: "x", verdict: "conflict", source_ns: [2, 4] }).source_ns).toEqual([2, 4]);
    expect(() => ResearchClaimWrite.parse({ text: "x", verdict: "maybe", source_ns: [] })).toThrow();
  });
});
