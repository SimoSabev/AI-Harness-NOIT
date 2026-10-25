import { describe, expect, it } from "vitest";
import { StreamEvent, contextPct, createStreamCtx, streamEvent } from "./index.js";

describe("agent stream (v5 2.1, D-310)", () => {
  const ctx = () => createStreamCtx("r_01JABCDEFGHJKMNPQRSTVWXYZ0", () => "2026-10-22T10:00:00.000Z");
  it("an init event of the lead: session = run id, no parent, seq from 0", () => {
    const c = ctx();
    const e = streamEvent(c, { kind: "init" });
    expect(StreamEvent.parse(e)).toMatchObject({ kind: "init", seq: 0, session: "r_01JABCDEFGHJKMNPQRSTVWXYZ0", parent: null, text: null, tool: null });
    expect(streamEvent(c, { kind: "text", text: "hi" }).seq).toBe(1);
  });
  it("text is redacted and capped; a tool call summary is ≤ 300", () => {
    const c = ctx();
    const t = streamEvent(c, { kind: "text", text: `key sk-ant-abcdefghijklmnop ${"x".repeat(5000)}` });
    expect(t.text).not.toContain("sk-ant-abcdefghijklmnop");
    expect(t.text?.length).toBeLessThanOrEqual(4000);
    const call = streamEvent(c, { kind: "tool_call", text: "y".repeat(1000), tool: { kind: "bash", name: "Bash", touching: [], decision: null } });
    expect(call.text?.length).toBeLessThanOrEqual(300);
  });
  it("a subagent session is run_id:child with the lead as parent", () => {
    const c = ctx();
    const e = streamEvent(c, { kind: "subagent_start", child: "toolu_01" });
    expect(e.session).toBe("r_01JABCDEFGHJKMNPQRSTVWXYZ0:toolu_01");
    expect(e.parent).toBe("r_01JABCDEFGHJKMNPQRSTVWXYZ0");
  });
  it("rejects unknown kinds, absolute or escaping touching paths and extra keys", () => {
    const c = ctx();
    const ok = streamEvent(c, { kind: "tool_call", text: "edit", tool: { kind: "builtin", name: "Edit", touching: ["src/a.ts"], decision: "allowed" } });
    expect(() => StreamEvent.parse({ ...ok, kind: "telepathy" })).toThrow();
    expect(() => StreamEvent.parse({ ...ok, tool: { ...ok.tool, touching: ["/etc/passwd"] } })).toThrow();
    expect(() => StreamEvent.parse({ ...ok, tool: { ...ok.tool, touching: ["../x"] } })).toThrow();
    expect(() => StreamEvent.parse({ ...ok, extra: 1 })).toThrow();
  });
  it("context_pct: input over the model window; unknown model → null", () => {
    expect(contextPct("claude-sonnet-5-5", 50_000, { "claude-sonnet-5-5": 200_000 })).toBe(25);
    expect(contextPct("claude-sonnet-5-5", 900_000, { "claude-sonnet-5-5": 200_000 })).toBe(100);
    expect(contextPct("mystery", 10, {})).toBeNull();
  });
});
