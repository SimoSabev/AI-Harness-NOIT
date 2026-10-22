import { existsSync, readFileSync } from "node:fs";
import { StreamEvent, createStreamCtx } from "@mandat/contract";
import type { StreamEvent as Ev } from "@mandat/contract";
import { describe, expect, it } from "vitest";
import { claudeAdapter, claudeToStream, codexAdapter, codexToStream, fakeAdapter, fakeCodexAdapter } from "./index.js";

const RUN = "r_01JABCDEFGHJKMNPQRSTVWXYZ0";
const fx = (p: string) => readFileSync(new URL(`../../../fixtures/${p}`, import.meta.url), "utf8").split("\n").filter((l) => l.length > 0);
const T = "2026-10-22T10:00:00.000Z";
function run(lines: string[], f: typeof claudeToStream, windows?: Record<string, number>): Ev[] {
  const ctx = createStreamCtx(RUN, () => T);
  return lines.flatMap((l) => f(l, ctx, windows));
}
const kinds = (es: Ev[]) => es.map((e) => e.kind);

describe("claude stream-json → StreamEvent (v5 2.1)", () => {
  const es = run(fx("stream-json/claude-synthetic-subagent.jsonl"), claudeToStream, { "claude-sonnet-5-5": 200_000 });
  it("every event validates; seq is 0..n-1 in order", () => {
    for (const e of es) StreamEvent.parse(e);
    expect(es.map((e) => e.seq)).toEqual(es.map((_, i) => i));
  });
  it("init, tool calls with touching, a subagent session, a denied push, mcp, result + usage", () => {
    expect(es[0]?.kind).toBe("init");
    const edit = es.find((e) => e.kind === "tool_call" && e.tool?.name === "Edit");
    expect(edit?.tool?.touching).toEqual(["src/cart.ts"]);
    const subRead = es.find((e) => e.kind === "tool_call" && e.tool?.name === "Read");
    expect(subRead?.session).toBe(`${RUN}:toolu_task1`);
    expect(subRead?.parent).toBe(RUN);
    expect(subRead?.tool?.touching).toEqual(["src/cart.ts"]); // /m/work/ prefix stripped
    expect(kinds(es).filter((k) => k === "subagent_start")).toHaveLength(1);
    expect(kinds(es).filter((k) => k === "subagent_stop")).toHaveLength(1);
    const denied = es.find((e) => e.kind === "permission");
    expect(denied?.tool).toMatchObject({ kind: "bash", name: "Bash", decision: "denied" });
    expect(es.find((e) => e.kind === "tool_call" && e.tool?.kind === "mandat")?.tool?.name).toBe("mandat.mandat_status");
    const bash = es.find((e) => e.kind === "tool_call" && e.text?.includes("vitest"));
    expect(bash?.tool?.touching).toEqual([]);
    expect(bash?.text).not.toContain("mdt_abcdefghijklmnop");
    expect(es.some((e) => e.kind === "unparsed")).toBe(true);
    const usage = es.filter((e) => e.kind === "usage");
    expect(usage[0]?.usage?.context_pct).toBe(10); // 20 000 of 200 000
    expect(usage.at(-1)?.usage).toMatchObject({ input: 31000, output: 620, cache_read: 12000, cache_write: 3000, usd: 0.0421 });
    expect(es.at(-1)).toMatchObject({ kind: "result", result: { ok: true, claimed_done: true, error: null } });
  });
  it("snapshot", () => {
    expect(es.map((e) => [e.seq, e.kind, e.session.replace(RUN, "R"), e.tool?.name ?? null, e.tool?.decision ?? null])).toMatchSnapshot();
  });
  // D-276: the real S0 recording appears only after the local live run (docs/setup/local-live-checklist.md)
  it.skipIf(!existsSync(new URL("../../../fixtures/stream-json/claude-2.1.302-s0.jsonl", import.meta.url)))("stream parser: real S0 fixture", () => {
    const real = run(fx("stream-json/claude-2.1.302-s0.jsonl"), claudeToStream);
    expect(real[0]?.kind).toBe("init");
    expect(real.some((e) => e.kind === "tool_call")).toBe(true);
    expect(real.at(-1)?.kind).toBe("result");
  });
});

describe("codex JSONL → StreamEvent (v5 2.1)", () => {
  it("collab subagent, bash, file change with touching, mcp (mandat + denied), web search, message, usage + result", () => {
    const es = run(fx("codex-jsonl/synthetic-collab.jsonl"), codexToStream);
    for (const e of es) StreamEvent.parse(e);
    expect(es[0]?.kind).toBe("init");
    expect(kinds(es)).toContain("step");
    const start = es.find((e) => e.kind === "subagent_start");
    expect(start?.session).toBe(`${RUN}:0199child-1`);
    expect(kinds(es)).toContain("subagent_stop");
    const bash = es.filter((e) => e.tool?.kind === "bash");
    expect(bash.map((e) => [e.kind, e.tool?.decision])).toEqual([["tool_call", null], ["tool_result", "error"]]);
    const fc = es.find((e) => e.kind === "tool_call" && e.tool?.name === "file_change");
    expect(fc?.tool?.touching).toEqual(["src/cart.ts", "tests/cart.test.ts"]);
    expect(es.find((e) => e.tool?.kind === "mandat")?.tool?.name).toBe("mandat.mandat_status");
    expect(es.find((e) => e.kind === "tool_result" && e.tool?.name === "github.get_issue")?.tool?.decision).toBe("error");
    expect(es.find((e) => e.tool?.name === "web_search")?.text).toContain("vitest json reporter");
    expect(es.find((e) => e.kind === "text")?.text).not.toContain("sk-proj-abcdefghijklmnopqrst");
    expect(es.find((e) => e.kind === "usage")?.usage).toMatchObject({ input: 64000, output: 900, cache_read: 32000, cache_write: 100 });
    expect(es.at(-1)).toMatchObject({ kind: "result", result: { ok: true, claimed_done: true } });
  });
  it("turn.failed → result not ok with the error", () => {
    const es = run(fx("codex-jsonl/synthetic-failed.jsonl"), codexToStream);
    expect(es.at(-1)).toMatchObject({ kind: "result", result: { ok: false, claimed_done: false, error: "429 Too Many Requests" } });
  });
  it("the recorded fake honest-fix", () => {
    const es = run(fx("codex-jsonl/honest-fix.jsonl"), codexToStream);
    expect(es.at(-1)?.result?.claimed_done).toBe(true);
  });
});

describe("every adapter has toStream", () => {
  it("claude, codex, fake, fake-codex", () => {
    const line = '{"type":"system","subtype":"init","session_id":"x","model":"m","tools":[],"mcp_servers":[]}';
    for (const a of [claudeAdapter({ model: "claude-sonnet-5-5", cliVersion: "2.1.302" }), fakeAdapter("honest-fix")]) expect(a.toStream(line, createStreamCtx(RUN, () => T))[0]?.kind).toBe("init");
    const cl = '{"type":"thread.started","thread_id":"t"}';
    for (const a of [codexAdapter({ model: "gpt-5.5-codex", cliVersion: "0.160.1" }), fakeCodexAdapter("honest-fix")]) expect(a.toStream(cl, createStreamCtx(RUN, () => T))[0]?.kind).toBe("init");
  });
});
