import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createStreamCtx } from "@mandat/contract";
import { cursorAdapter } from "./adapter.js";
import { CURSOR_ENV, buildCursorArgv } from "./argv.js";
import { parseCursorStatus } from "./status.js";
import { cursorClaimedDone, parseCursorLine } from "./stream.js";
import { cursorToStream } from "./to-stream.js";

// D-464: Cursor CLI (`agent` 2026.10.22-27dcf5f) with the person's own login. The fixture (fixtures/cursor-jsonl) is
// reconstructed from the docs (cursor.com/docs/cli/reference/output-format) and the shipped emitter (js/7000.index.js),
// spike 04.11.2026 — not captured from a live run [НП]. The tool error shape (result.failure/error/…) and the MCP
// providerIdentifier value are [НП].
const fx = (n: string) => readFileSync(new URL(`../../../../fixtures/cursor-jsonl/${n}.jsonl`, import.meta.url), "utf8").split("\n").filter(Boolean);
const ctx = { runId: "r1", taskId: "t1", prompt: "Fix it", model: "m", budgetUsd: 1, contractFile: "/m/in/contract.txt" as const, contractText: "# Mandat task contract\nTask (bugfix): Fix it\n", workdir: "/m/work" as const, notesPath: "/m/out/notes.txt" as const };
const canary = { name: "AWS_SECRET_ACCESS_KEY" as const, value: "c" };
const now = () => "2026-11-05T10:00:00.000Z";
const HEAD = ["agent", "-p", "--output-format", "stream-json", "--force", "--trust", "--sandbox", "disabled", "--disable-auto-update"];

describe("cursor-argv (D-464)", () => {
  it("the exact array with a model; no --approve-mcps", () => {
    const a = buildCursorArgv({ model: "gpt-5", prompt: "Fix it" });
    expect(a).toEqual([...HEAD, "--model", "gpt-5", "Fix it"]);
    expect(a).not.toContain("--approve-mcps");
    expect(a).not.toContain("--api-key");
  });
  it("the model \"default\" leaves --model out", () => {
    expect(buildCursorArgv({ model: "default", prompt: "Fix it" })).toEqual([...HEAD, "Fix it"]);
  });
  it("the public env: no browser; never a credential", () => {
    expect(CURSOR_ENV).toEqual({ NO_OPEN_BROWSER: "1" });
    expect(Object.keys(CURSOR_ENV).some((k) => /KEY|TOKEN/.test(k))).toBe(false);
  });
});

describe("cursor-launch (D-464)", () => {
  const a = cursorAdapter({ model: "default", cliVersion: "2026.10.22-27dcf5f" });
  it("a subscription profile: only the canary in env, stdin closed, the contract is the prompt", () => {
    const l = a.launch(ctx, { PROFILE: true }, canary);
    expect(l.env).toEqual({ AWS_SECRET_ACCESS_KEY: "c" });
    expect(l.stdin).toBe("closed");
    expect(l.argv).toEqual([...HEAD, ctx.contractText]);
    expect(l.publicEnv).toBeUndefined();
    expect(a.id).toBe("cursor");
    expect(a.supportsSteering).toBe(false);
  });
  it("the harness argv is ignored; its env passes through as public env; an empty env adds nothing", () => {
    const l = a.launch({ ...ctx, harness: { argv: ["--policy", "/x"], env: { X_TEST: "1" } } }, { PROFILE: true }, canary);
    expect(l.argv).not.toContain("--policy");
    expect(l.publicEnv).toEqual({ X_TEST: "1" });
    expect(a.launch({ ...ctx, harness: { argv: [], env: {} } }, { PROFILE: true }, canary).publicEnv).toBeUndefined();
  });
  it("a model goes through --model", () => {
    const l = cursorAdapter({ model: "sonnet-4", cliVersion: "2026.10.22-27dcf5f" }).launch(ctx, { PROFILE: true }, canary);
    expect(l.argv).toEqual([...HEAD, "--model", "sonnet-4", ctx.contractText]);
  });
  it("refuses any channel that is not a profile", () => {
    expect(() => a.launch(ctx, { OPENAI_API_KEY: "mdt_x" }, canary)).toThrow();
    expect(() => a.launch(ctx, { GEMINI_API_KEY: "mdt_g", GOOGLE_GEMINI_BASE_URL: "http://egress-gate" }, canary)).toThrow();
    expect(() => a.launch(ctx, { ANTHROPIC_API_KEY: "mdt_a", ANTHROPIC_BASE_URL: "http://egress-gate" }, canary)).toThrow();
  });
});

describe("cursor-parse (D-464)", () => {
  it("honest-fix: init, text, tool calls from started, results from completed, result with usage; claimedDone", () => {
    const ev = fx("honest-fix").flatMap(parseCursorLine);
    expect(ev[0]).toEqual({ type: "init", sessionId: "6f1c2a9e-0b7d-4c55-9a51-3d2e8f1a7b00", model: "Claude 4.8 Opus", tools: [], mcpServers: [], capabilities: [] });
    expect(ev.filter((e) => e.type === "assistant_text").map((e) => e.type === "assistant_text" && e.text)).toEqual(["I'll run the tests first.", "Fixed rounding in src/cart.ts; all tests pass."]);
    expect(ev.filter((e) => e.type === "tool_use").map((e) => e.type === "tool_use" && [e.id, e.name])).toEqual([
      ["toolu_01", "shellToolCall"], ["toolu_02", "readToolCall"], ["toolu_03", "editToolCall"], ["toolu_04", "mcpToolCall"], ["toolu_05", "shellToolCall"],
    ]);
    expect(ev.find((e) => e.type === "tool_use")).toEqual({ type: "tool_use", id: "toolu_01", name: "shellToolCall", input: { command: "npx vitest run", workingDirectory: "/m/work" } });
    expect(ev.filter((e) => e.type === "tool_result")).toEqual([
      { type: "tool_result", toolUseId: "toolu_01", isError: true },
      { type: "tool_result", toolUseId: "toolu_02", isError: false },
      { type: "tool_result", toolUseId: "toolu_03", isError: false },
      { type: "tool_result", toolUseId: "toolu_04", isError: false },
      { type: "tool_result", toolUseId: "toolu_05", isError: false },
    ]);
    expect(ev.at(-1)).toEqual({
      type: "result", subtype: "success", isError: false, totalCostUsd: null, numTurns: null,
      usage: { input_tokens: 1200, cached_input_tokens: 800, cache_write_input_tokens: 50, output_tokens: 300, reasoning_output_tokens: 0 },
    });
    expect(cursorClaimedDone(ev, 0)).toBe(true);
    expect(cursorClaimedDone(ev, 1)).toBe(false);
  });
  it("an error has no result line (stderr + exit 1) → not claimed done; a cut run → not claimed done", () => {
    const cut = fx("honest-fix").slice(0, -1).flatMap(parseCursorLine);
    expect(cursorClaimedDone(cut, 1)).toBe(false);
    expect(cursorClaimedDone(cut, 0)).toBe(false);
    expect(cursorClaimedDone([], null)).toBe(false);
  });
  it("result without usage, or with non-numeric usage → no usage; is_error → error", () => {
    expect(parseCursorLine(JSON.stringify({ type: "result", subtype: "success", is_error: false }))).toEqual([{ type: "result", subtype: "success", isError: false, totalCostUsd: null, numTurns: null }]);
    expect(parseCursorLine(JSON.stringify({ type: "result", subtype: "success", usage: { inputTokens: "x", outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 } }))[0]).not.toHaveProperty("usage");
    expect(parseCursorLine(JSON.stringify({ type: "result", subtype: "error", is_error: true }))).toEqual([{ type: "result", subtype: "error", isError: true, totalCostUsd: null, numTurns: null }]);
  });
  it("never throws: garbage, arrays, odd tool_call lines", () => {
    expect(parseCursorLine("not json")).toEqual([{ type: "unparsed", raw: "not json" }]);
    expect(parseCursorLine("[1]")[0]?.type).toBe("unparsed");
    expect(parseCursorLine(JSON.stringify({ type: "tool_call", subtype: "started", call_id: "x", tool_call: "nope" }))).toEqual([{ type: "tool_use", id: "x", name: "unknown", input: {} }]);
    expect(parseCursorLine(JSON.stringify({ type: "tool_call", subtype: "weird" }))[0]?.type).toBe("unparsed");
    expect(parseCursorLine(JSON.stringify({ type: "interaction_query", subtype: "response" }))[0]?.type).toBe("unparsed");
    expect(parseCursorLine(JSON.stringify({ type: "tool_call", subtype: "started", call_id: "f", tool_call: { function: { name: "custom", arguments: "{\"a\":1}" } } }))).toEqual([{ type: "tool_use", id: "f", name: "custom", input: { a: 1 } }]);
  });
});

describe("cursor-to-stream (D-464)", () => {
  it("honest-fix → init (session id), text, tool_call/tool_result with kinds and paths, usage, result ok", () => {
    const c = createStreamCtx("r1", now);
    const ev = fx("honest-fix").flatMap((l) => cursorToStream(l, c));
    expect(ev.map((e) => e.kind)).toEqual(["init", "text", "tool_call", "tool_result", "tool_call", "tool_result", "tool_call", "tool_result", "tool_call", "tool_result", "tool_call", "tool_result", "text", "usage", "result"]);
    expect(ev[0]?.text).toBe("6f1c2a9e-0b7d-4c55-9a51-3d2e8f1a7b00");
    const calls = ev.filter((e) => e.kind === "tool_call").map((e) => [e.tool?.kind, e.tool?.name, e.tool?.touching, e.text]);
    expect(calls).toEqual([
      ["bash", "shell", [], "npx vitest run"],
      ["builtin", "read", ["src/cart.ts"], "read src/cart.ts"],
      ["builtin", "edit", ["src/cart.ts"], "edit src/cart.ts"],
      ["mandat", "mandat.ask", [], "mandat.ask"],
      ["bash", "shell", [], "npx vitest run"],
    ]);
    expect(ev.filter((e) => e.kind === "tool_result").map((e) => [e.tool?.name, e.tool?.decision])).toEqual([["shell", "error"], ["read", "allowed"], ["edit", "allowed"], ["mandat.ask", "allowed"], ["shell", "allowed"]]);
    expect(ev.find((e) => e.kind === "usage")?.usage).toEqual({ input: 1200, output: 300, cache_read: 800, cache_write: 50, context_pct: null, usd: null });
    expect(ev.at(-1)?.result).toEqual({ ok: true, claimed_done: true, error: null });
    expect(ev.map((e) => e.seq)).toEqual(ev.map((_, i) => i));
  });
  it("other MCP servers, write/delete paths, unknown kinds, a result without usage, garbage", () => {
    const c = createStreamCtx("r2", now);
    const started = (call_id: string, tool_call: unknown) => JSON.stringify({ type: "tool_call", subtype: "started", call_id, tool_call });
    expect(cursorToStream(started("a", { mcpToolCall: { args: { providerIdentifier: "github", toolName: "search" } } }), c).map((e) => [e.tool?.kind, e.tool?.name])).toEqual([["mcp", "github.search"]]);
    expect(cursorToStream(started("b", { writeToolCall: { args: { path: "/m/work/a.ts", fileText: "x" } } }), c)[0]?.tool?.touching).toEqual(["a.ts"]);
    expect(cursorToStream(started("c", { deleteToolCall: { args: { path: "../etc/passwd" } } }), c)[0]?.tool).toEqual({ kind: "builtin", name: "delete", touching: [], decision: null });
    expect(cursorToStream(started("d", { grepToolCall: { args: { pattern: "x" } } }), c)[0]?.tool?.name).toBe("grep");
    const done = JSON.stringify({ type: "tool_call", subtype: "completed", call_id: "e", tool_call: { editToolCall: { args: { path: "x.ts" }, result: { writePermissionDenied: {} } } } });
    expect(cursorToStream(done, c)[0]?.tool?.decision).toBe("error");
    const r = cursorToStream(JSON.stringify({ type: "result", subtype: "success", is_error: false }), c);
    expect(r.map((e) => e.kind)).toEqual(["result"]);
    expect(cursorToStream("garbage", c)[0]?.kind).toBe("unparsed");
    expect(cursorToStream(JSON.stringify({ type: "system", subtype: "task_notification" }), c)[0]?.kind).toBe("unparsed");
  });
});

describe("cursor-status (D-464)", () => {
  it("authenticated → logged in with the email", () => {
    const out = JSON.stringify({ status: "authenticated", isAuthenticated: true, hasAccessToken: true, hasRefreshToken: true, userInfo: { email: "simo@example.com", userId: 1 } });
    expect(parseCursorStatus(out)).toEqual({ loggedIn: true, email: "simo@example.com" });
  });
  it("unauthenticated (spike, verified) → not logged in", () => {
    const out = "{\n  \"status\": \"unauthenticated\",\n  \"isAuthenticated\": false,\n  \"hasAccessToken\": false,\n  \"hasRefreshToken\": false,\n  \"message\": \"Not logged in\"\n}\n";
    expect(parseCursorStatus(out)).toEqual({ loggedIn: false, email: null });
  });
  it("authenticated without user details (offline) → logged in, no email; garbage → not logged in", () => {
    expect(parseCursorStatus(JSON.stringify({ status: "authenticated", isAuthenticated: true }))).toEqual({ loggedIn: true, email: null });
    expect(parseCursorStatus(JSON.stringify({ isAuthenticated: "true" }))).toEqual({ loggedIn: false, email: null });
    expect(parseCursorStatus("Status check error")).toEqual({ loggedIn: false, email: null });
    expect(parseCursorStatus("")).toEqual({ loggedIn: false, email: null });
  });
});

describe("cursor live", () => {
  // D-464: no Cursor login in this environment; SKIPPED until Simo runs it
  it.skip("a real `agent -p` run with a login profile produces a parseable stream", () => undefined);
});
