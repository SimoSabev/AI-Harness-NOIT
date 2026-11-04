import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createStreamCtx } from "@mandat/contract";
import { copilotAdapter } from "./adapter.js";
import { COPILOT_ENV, COPILOT_SETTINGS, buildCopilotArgv } from "./argv.js";
import { copilotClaimedDone, parseCopilotLine } from "./stream.js";
import { copilotToStream } from "./to-stream.js";
import { frame, statusLine, takeMessages } from "../../copilot/status.mjs";

// D-464: GitHub Copilot CLI (@github/copilot 1.0.105) with the person's own GitHub login (plaintext under COPILOT_HOME).
// The fixtures (fixtures/copilot-jsonl) are reconstructed from session-events.schema.json, spike 2026-11-04 — not captured
// from a live run [НП]. Tool names (bash, edit), the shape of modelMetrics.usage and the not-signed-in JSONL line are [НП].
const fx = (n: string) => readFileSync(new URL(`../../../../fixtures/copilot-jsonl/${n}.jsonl`, import.meta.url), "utf8").split("\n").filter(Boolean);
const ctx = { runId: "r1", taskId: "t1", prompt: "Fix it", model: "m", budgetUsd: 1, contractFile: "/m/in/contract.txt" as const, contractText: "# Mandat task contract\nTask (bugfix): Fix it\n", workdir: "/m/work" as const, notesPath: "/m/out/notes.txt" as const };
const canary = { name: "AWS_SECRET_ACCESS_KEY" as const, value: "c" };
const now = () => "2026-11-05T10:00:00.000Z";
const TAIL = ["--allow-all-tools", "--allow-all-paths", "--no-ask-user", "--no-auto-update", "--disable-client-telemetry", "--disable-builtin-mcps", "--no-color"];

describe("copilot-argv (D-464)", () => {
  it("the exact array with a model", () => {
    expect(buildCopilotArgv({ model: "gpt-5.4", prompt: "Fix it" })).toEqual(["copilot", "-p", "Fix it", "--output-format", "json", "--model", "gpt-5.4", ...TAIL]);
  });
  it("the model \"default\" leaves --model out", () => {
    expect(buildCopilotArgv({ model: "default", prompt: "Fix it" })).toEqual(["copilot", "-p", "Fix it", "--output-format", "json", ...TAIL]);
  });
  it("the public env and the settings the login needs; no credentials", () => {
    expect(COPILOT_ENV).toEqual({ COPILOT_AUTO_UPDATE: "false", COPILOT_OTEL_ENABLED: "false" });
    expect(COPILOT_SETTINGS).toEqual({ storeTokenPlaintext: true, banner: "never" });
    expect(Object.keys(COPILOT_ENV).some((k) => /TOKEN|KEY|SECRET/.test(k))).toBe(false);
  });
});

describe("copilot-launch (D-464)", () => {
  const a = copilotAdapter({ model: "default", cliVersion: "1.0.105" });
  it("a subscription profile: only the canary in env, stdin closed, the contract is the prompt", () => {
    const l = a.launch(ctx, { PROFILE: true }, canary);
    expect(l.env).toEqual({ AWS_SECRET_ACCESS_KEY: "c" });
    expect(l.stdin).toBe("closed");
    expect(l.argv).toEqual(["copilot", "-p", ctx.contractText, "--output-format", "json", ...TAIL]);
    expect(l.publicEnv).toBeUndefined();
    expect(a.id).toBe("copilot");
    expect(a.supportsSteering).toBe(false);
  });
  it("the harness argv is ignored; its env passes through as public env", () => {
    const l = a.launch({ ...ctx, harness: { argv: ["--policy", "/x"], env: { X_TEST: "1" } } }, { PROFILE: true }, canary);
    expect(l.argv).not.toContain("--policy");
    expect(l.publicEnv).toEqual({ X_TEST: "1" });
  });
  it("refuses any channel that is not a profile", () => {
    expect(() => a.launch(ctx, { OPENAI_API_KEY: "mdt_x" }, canary)).toThrow();
    expect(() => a.launch(ctx, { ANTHROPIC_API_KEY: "mdt_a", ANTHROPIC_BASE_URL: "http://egress-gate" }, canary)).toThrow();
  });
});

describe("copilot-parse (D-464)", () => {
  it("honest-fix: init, text, tool calls only from execution_start, results, success with summed usage; claimedDone", () => {
    const ev = fx("honest-fix").flatMap(parseCopilotLine);
    expect(ev[0]).toEqual({ type: "init", sessionId: "0cb916db-26aa-40f2-86b5-1ba81b225fd2", model: "gpt-5.4", tools: [], mcpServers: [], capabilities: [] });
    expect(ev.filter((e) => e.type === "assistant_text").map((e) => e.type === "assistant_text" && e.text)).toEqual(["Running the tests first.", "Fixed rounding in src/cart.ts; all tests pass."]);
    expect(ev.filter((e) => e.type === "tool_use")).toEqual([
      { type: "tool_use", id: "call_1", name: "bash", input: { command: "npx vitest run" } },
      { type: "tool_use", id: "call_2", name: "edit", input: { path: "/m/work/src/cart.ts", old_str: "0.1", new_str: "0.10" } },
      { type: "tool_use", id: "call_3", name: "ask", input: {} },
    ]);
    expect(ev.filter((e) => e.type === "tool_result")).toEqual([
      { type: "tool_result", toolUseId: "call_1", isError: true },
      { type: "tool_result", toolUseId: "call_2", isError: false },
      { type: "tool_result", toolUseId: "call_3", isError: false },
    ]);
    expect(ev.some((e) => e.type === "unparsed")).toBe(false);
    expect(ev.at(-1)).toEqual({ type: "result", subtype: "success", isError: false, totalCostUsd: null, numTurns: null, usage: { input_tokens: 2500, cached_input_tokens: 900, cache_write_input_tokens: 10, output_tokens: 150, reasoning_output_tokens: 0 } });
    expect(copilotClaimedDone(ev, 0)).toBe(true);
    expect(copilotClaimedDone(ev, 1)).toBe(false);
  });
  it("no shutdown (the run was cut) → not claimed done", () => {
    expect(copilotClaimedDone(fx("honest-fix").slice(0, -1).flatMap(parseCopilotLine), 0)).toBe(false);
  });
  it("not-signed-in: a session error, the plain stderr-like line is unparsed; never claimed done", () => {
    const ev = fx("not-signed-in").flatMap(parseCopilotLine);
    expect(ev).toEqual([
      { type: "result", subtype: "error", isError: true, totalCostUsd: null, numTurns: null },
      { type: "unparsed", raw: "Error: No authentication information found." },
    ]);
    expect(copilotClaimedDone(ev, 1)).toBe(false);
    expect(copilotClaimedDone(ev, 0)).toBe(false);
  });
  it("an error followed by a shutdown is still not claimed done", () => {
    const ev = [...fx("not-signed-in"), fx("honest-fix").at(-1) as string].flatMap(parseCopilotLine);
    expect(copilotClaimedDone(ev, 0)).toBe(false);
  });
  it("shutdown without usage metrics has no usage; garbage and unknown types never throw", () => {
    expect(parseCopilotLine(JSON.stringify({ type: "session.shutdown", data: { modelMetrics: { m: { requests: { count: 1 } } } } }))).toEqual([{ type: "result", subtype: "success", isError: false, totalCostUsd: null, numTurns: null }]);
    expect(parseCopilotLine(JSON.stringify({ type: "session.shutdown" }))).toEqual([{ type: "result", subtype: "success", isError: false, totalCostUsd: null, numTurns: null }]);
    expect(parseCopilotLine("not json")).toEqual([{ type: "unparsed", raw: "not json" }]);
    expect(parseCopilotLine("[1]")[0]?.type).toBe("unparsed");
    expect(parseCopilotLine(JSON.stringify({ type: "something.new", data: {} }))[0]?.type).toBe("unparsed");
    expect(parseCopilotLine(JSON.stringify({ type: "assistant.message", data: { content: "" } }))).toEqual([]);
    expect(parseCopilotLine(JSON.stringify({ type: "tool.execution_start", data: "x" }))).toEqual([{ type: "tool_use", id: "", name: "", input: {} }]);
  });
});

describe("copilot-to-stream (D-464)", () => {
  it("honest-fix → init, text, usage, tool_call/tool_result with kinds and paths, result ok", () => {
    const c = createStreamCtx("r1", now);
    const ev = fx("honest-fix").flatMap((l) => copilotToStream(l, c, { "gpt-5.4": 10000 }));
    expect(ev.map((e) => e.kind)).toEqual(["init", "text", "usage", "tool_call", "tool_result", "tool_call", "tool_result", "tool_call", "tool_result", "text", "result"]);
    expect(ev.find((e) => e.kind === "usage")?.usage).toEqual({ input: 1200, output: 80, cache_read: 400, cache_write: 0, context_pct: 12, usd: 1 });
    const calls = ev.filter((e) => e.kind === "tool_call").map((e) => [e.tool?.kind, e.tool?.name, e.tool?.touching, e.text]);
    expect(calls).toEqual([["bash", "bash", [], "npx vitest run"], ["builtin", "edit", ["src/cart.ts"], "edit src/cart.ts"], ["mandat", "mandat.ask", [], "mandat.ask"]]);
    expect(ev.filter((e) => e.kind === "tool_result").map((e) => [e.tool?.name, e.tool?.decision])).toEqual([["bash", "error"], ["edit", "allowed"], ["mandat.ask", "allowed"]]);
    expect(ev.at(-1)?.result).toEqual({ ok: true, claimed_done: true, error: null });
    expect(ev.map((e) => e.seq)).toEqual(ev.map((_, i) => i));
  });
  it("not-signed-in → result not ok with the message; a later shutdown keeps it not ok", () => {
    const c = createStreamCtx("r2", now);
    const ev = fx("not-signed-in").flatMap((l) => copilotToStream(l, c));
    expect(ev.map((e) => e.kind)).toEqual(["result", "unparsed"]);
    expect(ev[0]?.result).toEqual({ ok: false, claimed_done: false, error: "No authentication information found." });
    const end = copilotToStream(JSON.stringify({ type: "session.shutdown", data: {} }), c)[0];
    expect(end?.result).toEqual({ ok: false, claimed_done: false, error: "No authentication information found." });
  });
  it("other MCP servers → mcp; shell/powershell → bash; unknown result → builtin unknown; usage without cost → usd null", () => {
    const c = createStreamCtx("r3", now);
    const start = (id: string, toolName: string, extra: Record<string, unknown>) => JSON.stringify({ type: "tool.execution_start", data: { toolCallId: id, toolName, ...extra } });
    const out = [start("a", "github-search", { mcpServerName: "github" }), start("b", "powershell", { arguments: { command: "dir" } }), start("c", "shell", {})].flatMap((l) => copilotToStream(l, c));
    expect(out.map((e) => [e.tool?.kind, e.tool?.name, e.text])).toEqual([["mcp", "github.search", "github.search"], ["bash", "powershell", "dir"], ["bash", "shell", null]]);
    const r = copilotToStream(JSON.stringify({ type: "tool.execution_complete", data: { toolCallId: "nope", success: true } }), c)[0];
    expect(r?.tool).toEqual({ kind: "builtin", name: "unknown", touching: [], decision: "allowed" });
    const u = copilotToStream(JSON.stringify({ type: "assistant.usage", ephemeral: true, data: { model: "x", inputTokens: 5 } }), c)[0];
    expect(u?.usage).toEqual({ input: 5, output: 0, cache_read: 0, cache_write: 0, context_pct: null, usd: null });
    expect(copilotToStream("garbage", c)[0]?.kind).toBe("unparsed");
    expect(copilotToStream(JSON.stringify({ type: "assistant.turn_start", data: {} }), c)).toEqual([]);
  });
});

describe("copilot status probe (D-464)", () => {
  it("frames JSON-RPC with Content-Length (bytes, not chars)", () => {
    const f = frame(1, "ping", { message: "ä" }) as string;
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { message: "ä" } });
    expect(f).toBe(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  });
  it("splits framed messages and keeps a partial rest", () => {
    const a = frame(1, "x", {}) as string;
    const b = frame(2, "y", {}) as string;
    const all = Buffer.from(a + b.slice(0, 10));
    const r = takeMessages(all) as { messages: { id: number }[]; rest: Buffer };
    expect(r.messages.map((m) => m.id)).toEqual([1]);
    expect(r.rest.toString()).toBe(b.slice(0, 10));
    expect((takeMessages(Buffer.from("Content-Length: 2\r\n\r\n{x")) as { messages: unknown[] }).messages).toEqual([]);
  });
  it("prints only isAuthenticated and login, never anything else from the reply", () => {
    expect(statusLine({ isAuthenticated: true, login: "octocat", authType: "user", host: "https://github.com", token: "gho_secret" })).toBe('{"isAuthenticated":true,"login":"octocat"}');
    expect(statusLine({ isAuthenticated: false, statusMessage: "Not authenticated" })).toBe('{"isAuthenticated":false}');
    expect(statusLine({ isAuthenticated: "yes", login: 5 })).toBe('{"isAuthenticated":false}');
    expect(statusLine(null)).toBeNull();
  });
});

describe("copilot live", () => {
  // D-464: no Copilot login in this environment; SKIPPED until Simo runs it
  it.skip("a real `copilot -p --output-format json` run with a login profile produces a parseable stream", () => undefined);
});
