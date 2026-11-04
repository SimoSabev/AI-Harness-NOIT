import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createStreamCtx } from "@mandat/contract";
import { kimiAdapter } from "./adapter.js";
import { KIMI_ENV, buildKimiArgv } from "./argv.js";
import { kimiClaimedDone, parseKimiLine } from "./stream.js";
import { kimiToStream } from "./to-stream.js";

// D-464: Kimi Code CLI (@moonshot-ai/kimi-code 2.4.1) with the person's own subscription login. The fixtures
// (fixtures/kimi-jsonl) are reconstructed from source (PromptJsonWriter in dist/main.mjs), spike 2026-11-04 — not captured
// from a live run [НП]. Tool names (Shell, StrReplaceFile) and the MCP prefix are [НП].
const fx = (n: string) => readFileSync(new URL(`../../../../fixtures/kimi-jsonl/${n}.jsonl`, import.meta.url), "utf8").split("\n").filter(Boolean);
const ctx = { runId: "r1", taskId: "t1", prompt: "Fix it", model: "m", budgetUsd: 1, contractFile: "/m/in/contract.txt" as const, contractText: "# Mandat task contract\nTask (bugfix): Fix it\n", workdir: "/m/work" as const, notesPath: "/m/out/notes.txt" as const };
const canary = { name: "AWS_SECRET_ACCESS_KEY" as const, value: "c" };
const now = () => "2026-11-05T10:00:00.000Z";

describe("kimi-argv (D-464)", () => {
  it("the exact array with a model: print mode, stream-json, -m, no --yolo", () => {
    expect(buildKimiArgv({ model: "kimi-code/kimi-k2", prompt: "Fix it" })).toEqual(["kimi", "--output-format", "stream-json", "-m", "kimi-code/kimi-k2", "-p", "Fix it"]);
  });
  it("the model \"default\" leaves -m out (config.toml's default_model)", () => {
    expect(buildKimiArgv({ model: "default", prompt: "Fix it" })).toEqual(["kimi", "--output-format", "stream-json", "-p", "Fix it"]);
  });
  it("the public env: no telemetry, no auto-update", () => {
    expect(KIMI_ENV).toEqual({ KIMI_DISABLE_TELEMETRY: "1", KIMI_CODE_NO_AUTO_UPDATE: "1" });
  });
});

describe("kimi-launch (D-464)", () => {
  const a = kimiAdapter({ model: "default", cliVersion: "2.4.1" });
  it("a subscription profile: only the canary in env, stdin closed, the contract is the prompt", () => {
    const l = a.launch(ctx, { PROFILE: true }, canary);
    expect(l.env).toEqual({ AWS_SECRET_ACCESS_KEY: "c" });
    expect(l.stdin).toBe("closed");
    expect(l.argv).toEqual(["kimi", "--output-format", "stream-json", "-p", ctx.contractText]);
    expect(l.publicEnv).toBeUndefined();
    expect(a.id).toBe("kimi");
    expect(a.supportsSteering).toBe(false);
  });
  it("the harness argv is ignored; its env passes through as public env", () => {
    const l = a.launch({ ...ctx, harness: { argv: ["--policy", "/x"], env: { X_TEST: "1" } } }, { PROFILE: true }, canary);
    expect(l.argv).not.toContain("--policy");
    expect(l.publicEnv).toEqual({ X_TEST: "1" });
  });
  it("refuses any channel that is not a profile", () => {
    expect(() => a.launch(ctx, { OPENAI_API_KEY: "mdt_x" }, canary)).toThrow();
    expect(() => a.launch(ctx, { GEMINI_API_KEY: "mdt_g", GOOGLE_GEMINI_BASE_URL: "http://egress-gate" }, canary)).toThrow();
    expect(() => a.launch(ctx, { ANTHROPIC_API_KEY: "mdt_a", ANTHROPIC_BASE_URL: "http://egress-gate" }, canary)).toThrow();
  });
});

describe("kimi-parse (D-464)", () => {
  it("honest-fix: text, tool calls with parsed input, results, a retry, the resume hint as success; claimedDone", () => {
    const ev = fx("honest-fix").flatMap(parseKimiLine);
    expect(ev[0]?.type).toBe("unparsed");
    expect(ev.filter((e) => e.type === "assistant_text").map((e) => e.type === "assistant_text" && e.text)).toEqual(["I'll look at the failing test first.", "Fixed rounding in src/cart.ts; all tests pass."]);
    expect(ev.filter((e) => e.type === "tool_use")).toEqual([
      { type: "tool_use", id: "call_01", name: "Shell", input: { command: "npx vitest run" } },
      { type: "tool_use", id: "call_02", name: "StrReplaceFile", input: { path: "/m/work/src/cart.ts", old: "0.1", new: "0.10" } },
      { type: "tool_use", id: "call_03", name: "mcp__mandat__ask", input: {} },
    ]);
    expect(ev.filter((e) => e.type === "tool_result")).toEqual([
      { type: "tool_result", toolUseId: "call_01", isError: false },
      { type: "tool_result", toolUseId: "call_02", isError: false },
      { type: "tool_result", toolUseId: "call_03", isError: false },
    ]);
    expect(ev.find((e) => e.type === "api_retry")).toEqual({ type: "api_retry", attempt: 1, errorStatus: 429, error: "RateLimitError" });
    expect(ev.at(-1)).toEqual({ type: "result", subtype: "success", isError: false, totalCostUsd: null, numTurns: null });
    expect(kimiClaimedDone(ev, 0)).toBe(true);
    expect(kimiClaimedDone(ev, 1)).toBe(false);
  });
  it("error: a session-busy line is a result error; garbage is unparsed and never throws", () => {
    const ev = fx("error").flatMap(parseKimiLine);
    expect(ev.at(-1)).toEqual({ type: "result", subtype: "error", isError: true, totalCostUsd: null, numTurns: null });
    expect(kimiClaimedDone(ev, 4)).toBe(false);
    expect(kimiClaimedDone(ev, 0)).toBe(false);
    expect(parseKimiLine("not json")).toEqual([{ type: "unparsed", raw: "not json" }]);
    expect(parseKimiLine("[1]")[0]?.type).toBe("unparsed");
    expect(parseKimiLine(JSON.stringify({ role: "assistant", tool_calls: "x" }))).toEqual([]);
    expect(parseKimiLine(JSON.stringify({ role: "meta", type: "turn.step.retrying" }))).toEqual([{ type: "api_retry", attempt: 0, errorStatus: null, error: "" }]);
  });
  it("no resume hint (the run was cut) → not claimed done", () => {
    const ev = fx("honest-fix").slice(0, -1).flatMap(parseKimiLine);
    expect(kimiClaimedDone(ev, 0)).toBe(false);
  });
});

describe("kimi-to-stream (D-464)", () => {
  it("honest-fix → init, text, tool_call/tool_result with kinds and paths, retry step, result ok", () => {
    const c = createStreamCtx("r1", now);
    const ev = fx("honest-fix").flatMap((l) => kimiToStream(l, c));
    expect(ev.map((e) => e.kind)).toEqual(["init", "text", "tool_call", "tool_result", "tool_call", "tool_call", "tool_result", "step", "tool_result", "text", "result"]);
    expect(ev[0]?.text).toBeNull();
    const calls = ev.filter((e) => e.kind === "tool_call").map((e) => [e.tool?.kind, e.tool?.name, e.tool?.touching, e.text]);
    expect(calls).toEqual([["bash", "Shell", [], "npx vitest run"], ["builtin", "StrReplaceFile", ["src/cart.ts"], "StrReplaceFile src/cart.ts"], ["mandat", "mandat.ask", [], "mandat.ask"]]);
    expect(ev.filter((e) => e.kind === "tool_result").map((e) => [e.tool?.name, e.tool?.decision])).toEqual([["Shell", "allowed"], ["StrReplaceFile", "allowed"], ["mandat.ask", "allowed"]]);
    expect(ev.find((e) => e.kind === "step")?.text).toBe("retry");
    expect(ev.at(-1)?.result).toEqual({ ok: true, claimed_done: true, error: null });
    expect(ev.map((e) => e.seq)).toEqual(ev.map((_, i) => i));
  });
  it("error → result not ok with the message; garbage → unparsed; an unknown tool result → builtin unknown", () => {
    const c = createStreamCtx("r2", now);
    const ev = fx("error").flatMap((l) => kimiToStream(l, c));
    expect(ev.at(-1)?.result).toEqual({ ok: false, claimed_done: false, error: "Session is in use by another process" });
    expect(kimiToStream("garbage", c)[0]?.kind).toBe("unparsed");
    const r = kimiToStream(JSON.stringify({ role: "tool", tool_call_id: "nope", content: "x" }), c)[0];
    expect(r?.tool).toEqual({ kind: "builtin", name: "unknown", touching: [], decision: "allowed" });
  });
  it("mcp_<server>_<tool> of another server → mcp; run_shell → bash", () => {
    const c = createStreamCtx("r3", now);
    const line = JSON.stringify({ role: "assistant", tool_calls: [
      { type: "function", id: "a", function: { name: "mcp_github_search", arguments: "{}" } },
      { type: "function", id: "b", function: { name: "run_shell", arguments: "{\"command\":\"ls\"}" } },
    ] });
    expect(kimiToStream(line, c).map((e) => [e.tool?.kind, e.tool?.name, e.text])).toEqual([["mcp", "github.search", "github.search"], ["bash", "run_shell", "ls"]]);
  });
});

describe("kimi live", () => {
  // D-464: no Kimi subscription login in this environment; SKIPPED until Simo runs it
  it.skip("a real `kimi -p` run with a login profile produces a parseable stream", () => undefined);
});
