import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createStreamCtx } from "@mandat/contract";
import { minimaxAdapter } from "./adapter.js";
import { MINIMAX_ENV, buildMinimaxArgv } from "./argv.js";
import { minimaxClaimedDone, parseMinimaxLine } from "./stream.js";
import { minimaxToStream } from "./to-stream.js";

// D-464: MiniMax Code (`mcode`, @minimax-ai/code 0.7.4) with the person's own M Plan login. The fixtures
// (fixtures/minimax-jsonl) are reconstructed from source (the Exec event projector in run-exec-command-*.js), spike
// 04.11.2026, not captured from a live run [НП]. The toolCall shape {id,name,arguments} and the tool names (bash, edit_file,
// mcp__mandat__ask) are [НП]. not-signed-in is the in-stream form; the observed run printed only stderr and exited 3 [НП].
const fx = (n: string) => readFileSync(new URL(`../../../../fixtures/minimax-jsonl/${n}.jsonl`, import.meta.url), "utf8").split("\n").filter(Boolean);
const ctx = { runId: "r1", taskId: "t1", prompt: "Fix it", model: "m", budgetUsd: 1, contractFile: "/m/in/contract.txt" as const, contractText: "# Mandat task contract\nTask (bugfix): Fix it\n", workdir: "/m/work" as const, notesPath: "/m/out/notes.txt" as const };
const canary = { name: "AWS_SECRET_ACCESS_KEY" as const, value: "c" };
const now = () => "2026-11-05T10:00:00.000Z";
const env = { schemaVersion: 1, sequence: 1, timestampMs: 1, runId: "run_x", sessionId: "ses_x", turnId: "turn_x" };
const line = (o: Record<string, unknown>) => JSON.stringify({ ...env, ...o });
const LOGIN = "Sign in to MiniMax to use Agent features. Run `mcode login`, then retry.";

describe("minimax-argv (D-464)", () => {
  it("the exact array with a model: exec, stream-json, full permission, the work dir, the prompt last", () => {
    expect(buildMinimaxArgv({ model: "minimax/MiniMax-M3.1-Flash", prompt: "Fix it" })).toEqual(["mcode", "exec", "--output-format", "stream-json", "--permission", "full", "--cwd", "/m/work", "--model", "minimax/MiniMax-M3.1-Flash", "Fix it"]);
  });
  it("the model \"default\" leaves --model out (config.yaml's default)", () => {
    expect(buildMinimaxArgv({ model: "default", prompt: "Fix it" })).toEqual(["mcode", "exec", "--output-format", "stream-json", "--permission", "full", "--cwd", "/m/work", "Fix it"]);
  });
  it("the public env: no eval-step upload; no credential", () => {
    expect(MINIMAX_ENV).toEqual({ MCODE_DISABLE_EVAL_CAPTURE: "1" });
    expect(Object.keys(MINIMAX_ENV).some((k) => /KEY|TOKEN|SECRET/.test(k))).toBe(false);
  });
});

describe("minimax-launch (D-464)", () => {
  const a = minimaxAdapter({ model: "default", cliVersion: "0.7.4" });
  it("a subscription profile: only the canary in env, stdin closed, the contract is the prompt", () => {
    const l = a.launch(ctx, { PROFILE: true }, canary);
    expect(l.env).toEqual({ AWS_SECRET_ACCESS_KEY: "c" });
    expect(l.stdin).toBe("closed");
    expect(l.argv).toEqual(["mcode", "exec", "--output-format", "stream-json", "--permission", "full", "--cwd", "/m/work", ctx.contractText]);
    expect(l.publicEnv).toBeUndefined();
    expect(a.id).toBe("minimax");
    expect(a.supportsSteering).toBe(false);
  });
  it("the harness argv is ignored; its env passes through as public env", () => {
    const l = a.launch({ ...ctx, harness: { argv: ["--policy", "/x"], env: { X_TEST: "1" } } }, { PROFILE: true }, canary);
    expect(l.argv).not.toContain("--policy");
    expect(l.publicEnv).toEqual({ X_TEST: "1" });
    expect(a.launch({ ...ctx, harness: { argv: [], env: {} } }, { PROFILE: true }, canary).publicEnv).toBeUndefined();
  });
  it("refuses any channel that is not a profile", () => {
    expect(() => a.launch(ctx, { OPENAI_API_KEY: "mdt_x" }, canary)).toThrow();
    expect(() => a.launch(ctx, { GEMINI_API_KEY: "mdt_g", GOOGLE_GEMINI_BASE_URL: "http://egress-gate" }, canary)).toThrow();
    expect(() => a.launch(ctx, { ANTHROPIC_API_KEY: "mdt_a", ANTHROPIC_BASE_URL: "http://egress-gate" }, canary)).toThrow();
  });
});

describe("minimax-parse (D-464)", () => {
  it("honest-fix: init, completed text only, each tool call once with its input, no tool results, success with usage", () => {
    const ev = fx("honest-fix").flatMap(parseMinimaxLine);
    expect(ev[0]).toEqual({ type: "init", sessionId: "ses_m1", model: "", tools: [], mcpServers: [], capabilities: [] });
    expect(ev.filter((e) => e.type === "assistant_text").map((e) => e.type === "assistant_text" && e.text)).toEqual(["I'll run the tests first.", "Fixed rounding in src/cart.ts; all tests pass."]);
    expect(ev.filter((e) => e.type === "tool_use")).toEqual([
      { type: "tool_use", id: "call_1", name: "bash", input: { command: "npx vitest run" } },
      { type: "tool_use", id: "call_2", name: "edit_file", input: { path: "/m/work/src/cart.ts", old_string: "0.1", new_string: "0.10" } },
      { type: "tool_use", id: "call_3", name: "mcp__mandat__ask", input: {} },
    ]);
    expect(ev.some((e) => e.type === "tool_result" || e.type === "unparsed")).toBe(false);
    expect(ev.at(-1)).toEqual({ type: "result", subtype: "success", isError: false, totalCostUsd: null, numTurns: null, usage: { input_tokens: 18234, cached_input_tokens: 12000, cache_write_input_tokens: 0, output_tokens: 912, reasoning_output_tokens: 120 } });
    expect(minimaxClaimedDone(ev, 0)).toBe(true);
    expect(minimaxClaimedDone(ev, 4)).toBe(false);
  });
  it("not-signed-in: no retry (not retryable), a failed result without usage → not claimed done", () => {
    const ev = fx("not-signed-in").flatMap(parseMinimaxLine);
    expect(ev.some((e) => e.type === "api_retry")).toBe(false);
    expect(ev.at(-1)).toEqual({ type: "result", subtype: "failed", isError: true, totalCostUsd: null, numTurns: null });
    expect(minimaxClaimedDone(ev, 3)).toBe(false);
    expect(minimaxClaimedDone(ev, 0)).toBe(false);
  });
  it("a retryable turn.failed → api_retry; a resumed session → init; garbage and unknown types → unparsed; never throws", () => {
    expect(parseMinimaxLine(line({ type: "turn.failed", status: "failed", error: { category: "runtime", code: "PROVIDER_RATE_LIMITED", message: "429", retryable: true } }))).toEqual([{ type: "api_retry", attempt: 0, errorStatus: null, error: "PROVIDER_RATE_LIMITED" }]);
    expect(parseMinimaxLine(line({ type: "turn.failed", status: "timeout" }))).toEqual([]);
    expect(parseMinimaxLine(line({ type: "session.resumed" }))[0]?.type).toBe("init");
    expect(parseMinimaxLine("not json")).toEqual([{ type: "unparsed", raw: "not json" }]);
    expect(parseMinimaxLine("[1]")[0]?.type).toBe("unparsed");
    expect(parseMinimaxLine(line({ type: "weird.event" }))[0]?.type).toBe("unparsed");
    expect(parseMinimaxLine(line({ type: "item.completed", item: "x" }))).toEqual([]);
    expect(parseMinimaxLine(line({ type: "exec.completed", result: null }))).toEqual([{ type: "result", subtype: "failed", isError: true, totalCostUsd: null, numTurns: null }]);
  });
  it("a cut run (no exec.completed) → not claimed done", () => {
    const ev = fx("honest-fix").slice(0, -1).flatMap(parseMinimaxLine);
    expect(minimaxClaimedDone(ev, 0)).toBe(false);
  });
});

describe("minimax-to-stream (D-464)", () => {
  it("honest-fix → init, text, tool calls with kinds and paths (no tool results), usage, result ok", () => {
    const c = createStreamCtx("r1", now);
    const ev = fx("honest-fix").flatMap((l) => minimaxToStream(l, c, { "MiniMax-M3.1-Flash": 200000 }));
    expect(ev.map((e) => e.kind)).toEqual(["init", "text", "tool_call", "tool_call", "tool_call", "text", "usage", "result"]);
    expect(ev[0]?.text).toBe("ses_m1");
    const calls = ev.filter((e) => e.kind === "tool_call").map((e) => [e.tool?.kind, e.tool?.name, e.tool?.touching, e.tool?.decision, e.text]);
    expect(calls).toEqual([["bash", "bash", [], null, "npx vitest run"], ["builtin", "edit_file", ["src/cart.ts"], null, "edit_file src/cart.ts"], ["mandat", "mandat.ask", [], null, "mandat.ask"]]);
    expect(ev.find((e) => e.kind === "usage")?.usage).toEqual({ input: 18234, output: 912, cache_read: 12000, cache_write: 0, context_pct: 9.1, usd: null });
    expect(ev.at(-1)?.result).toEqual({ ok: true, claimed_done: true, error: null });
    expect(ev.map((e) => e.seq)).toEqual(ev.map((_, i) => i));
  });
  it("not-signed-in → step error, result not ok with the sign-in message", () => {
    const c = createStreamCtx("r2", now);
    const ev = fx("not-signed-in").flatMap((l) => minimaxToStream(l, c));
    expect(ev.map((e) => e.kind)).toEqual(["init", "step", "result"]);
    expect(ev[1]?.text).toBe("error");
    expect(ev.at(-1)?.result).toEqual({ ok: false, claimed_done: false, error: LOGIN });
  });
  it("a retryable failure → step retry; an unknown window → context_pct null; other MCP → mcp; garbage → unparsed", () => {
    const c = createStreamCtx("r3", now);
    expect(minimaxToStream(line({ type: "turn.failed", status: "failed", error: { category: "runtime", message: "x", retryable: true } }), c)[0]?.text).toBe("retry");
    expect(minimaxToStream(line({ type: "turn.completed", usage: { inputTokens: 5 } }), c)[0]?.usage).toEqual({ input: 5, output: 0, cache_read: 0, cache_write: 0, context_pct: null, usd: null });
    const tc = (id: string, name: string, args: unknown) => line({ type: "item.completed", item: { id, type: "tool_call", toolCall: { id, name, arguments: args } } });
    expect(minimaxToStream(tc("a", "mcp__github__search", {}), c).map((e) => [e.tool?.kind, e.tool?.name])).toEqual([["mcp", "github.search"]]);
    expect(minimaxToStream(tc("b", "run_shell", "{\"command\":\"ls\"}"), c).map((e) => [e.tool?.kind, e.text])).toEqual([["bash", "ls"]]);
    expect(minimaxToStream(tc("c", "read_file", { file_path: "/etc/passwd" }), c)[0]?.tool?.touching).toEqual([]);
    expect(minimaxToStream("garbage", c)[0]?.kind).toBe("unparsed");
    expect(minimaxToStream(line({ type: "exec.completed", result: { status: "timeout" } }), c)[0]?.result).toEqual({ ok: false, claimed_done: false, error: "timeout" });
  });
});

describe("minimax live", () => {
  // D-464: no M Plan login in this environment; SKIPPED until Simo runs it
  it.skip("a real `mcode exec` run with a login profile produces a parseable stream", () => undefined);
});
