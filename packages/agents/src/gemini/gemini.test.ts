import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createStreamCtx } from "@mandat/contract";
import { geminiAdapter } from "./adapter.js";
import { GEMINI_HOME, GEMINI_SYSTEM_SETTINGS, buildGeminiArgv } from "./argv.js";
import { geminiClaimedDone, parseGeminiLine } from "./stream.js";
import { geminiToStream } from "./to-stream.js";
import { claudeAdapter } from "../claude/adapter.js";
import { codexAdapter } from "../codex/adapter.js";
import { channelToken } from "../adapter.js";

// E9в (spec 5.3, D-423): Gemini CLI headless — the exact argv, the env (mdt_ token only, or a login profile), and the
// stream-json lines (fixtures/gemini-jsonl, handwritten from the CLI's types; live SKIPPED without a key).
const fx = (n: string) => readFileSync(new URL(`../../../../fixtures/gemini-jsonl/${n}.jsonl`, import.meta.url), "utf8").split("\n").filter(Boolean);
const ctx = { runId: "r1", taskId: "t1", prompt: "Fix it", model: "m", budgetUsd: 1, contractFile: "/m/in/contract.txt" as const, workdir: "/m/work" as const, notesPath: "/m/out/notes.txt" as const };
const canary = { name: "AWS_SECRET_ACCESS_KEY" as const, value: "c" };
const key = { GEMINI_API_KEY: "mdt_g", GOOGLE_GEMINI_BASE_URL: "http://egress-gate" as const };

describe("gemini-argv (D-423)", () => {
  it("the exact array: headless prompt, stream-json, yolo inside the sandbox, the model", () => {
    expect(buildGeminiArgv({ model: "gemini-2.5-pro", prompt: "Fix it" })).toEqual([
      "gemini", "--output-format", "stream-json", "--approval-mode", "yolo", "--skip-trust", "-m", "gemini-2.5-pro", "-p", "Fix it",
    ]);
  });
  it("the system settings: API key auth (never `gateway`), no stats/updates/telemetry/hooks, the harness instructions as the context file", () => {
    expect(GEMINI_SYSTEM_SETTINGS).toEqual({
      security: { auth: { selectedType: "gemini-api-key" } },
      privacy: { usageStatisticsEnabled: false },
      general: { enableAutoUpdate: false, enableAutoUpdateNotification: false },
      telemetry: { enabled: false },
      advanced: { ignoreLocalEnv: true },
      hooksConfig: { enabled: false },
      context: { fileName: ["instructions.md"] },
    });
    expect(GEMINI_HOME).toBe("/home/agent");
    // D-428: the image bakes the same file as /etc/gemini-cli/settings.json (the CLI's system settings on Linux)
    expect(JSON.parse(readFileSync(new URL("../../gemini/settings.json", import.meta.url), "utf8"))).toEqual(GEMINI_SYSTEM_SETTINGS);
  });
  it("env: only the mdt_ token (GEMINI_API_KEY); the base URL and home are the sandbox's public env (D-428); the harness env passes through", () => {
    const l = geminiAdapter({ model: "gemini-2.5-pro", cliVersion: "0.65.0" }).launch(ctx, key, canary);
    expect(l.env).toEqual({ GEMINI_API_KEY: "mdt_g", AWS_SECRET_ACCESS_KEY: "c" });
    expect(l.publicEnv).toBeUndefined();
    expect(l.stdin).toBe("closed");
    expect(channelToken(key)).toBe("mdt_g");
    const h = geminiAdapter({ model: "m", cliVersion: "0.65.0" }).launch({ ...ctx, harness: { argv: [], env: { X_TEST: "1" } } }, key, canary);
    expect(h.publicEnv).toEqual({ X_TEST: "1" });
  });
  it("a Google login profile: no key, the CLI's own login; wrong channels throw", () => {
    const l = geminiAdapter({ model: "gemini-2.5-pro", cliVersion: "0.65.0" }).launch(ctx, { PROFILE: true }, canary);
    expect(l.env).toEqual({ AWS_SECRET_ACCESS_KEY: "c" });
    expect(() => geminiAdapter({ model: "m", cliVersion: "0.65.0" }).launch(ctx, { OPENAI_API_KEY: "mdt_x" }, canary)).toThrow();
    expect(() => claudeAdapter({ model: "m", cliVersion: "2.1.302" }).launch(ctx, key, canary)).toThrow();
    expect(() => codexAdapter({ model: "m", cliVersion: "0.160.1" }).launch(ctx, key, canary)).toThrow();
  });
  it("the compiled control layer goes before -p", () => {
    const l = geminiAdapter({ model: "m", cliVersion: "0.65.0" }).launch({ ...ctx, harness: { argv: ["--policy", "/m/in/harness/gemini/policies"], env: {} } }, key, canary);
    expect(l.argv.slice(-4)).toEqual(["--policy", "/m/in/harness/gemini/policies", "-p", "Fix it"]);
  });
});

describe("gemini-parse (D-423)", () => {
  it("honest-fix: init, assistant text, tools, result with usage; claimedDone", () => {
    const ev = fx("honest-fix").flatMap(parseGeminiLine);
    expect(ev[0]).toEqual({ type: "init", sessionId: "5f0c9e2a-gem-0001", model: "gemini-2.5-pro", tools: [], mcpServers: [], capabilities: [] });
    expect(ev.filter((e) => e.type === "assistant_text").map((e) => e.type === "assistant_text" && e.text)).toEqual(["Running the tests first.", "Fixed the discount threshold in src/cart.ts."]);
    expect(ev.filter((e) => e.type === "tool_use").map((e) => e.type === "tool_use" && e.name)).toEqual(["run_shell_command", "replace", "mcp_mandat_ask"]);
    expect(ev.filter((e) => e.type === "tool_result").map((e) => e.type === "tool_result" && e.isError)).toEqual([false, false, true]);
    expect(ev.at(-1)).toEqual({ type: "result", subtype: "success", isError: false, totalCostUsd: null, numTurns: null, usage: { input_tokens: 1300, cached_input_tokens: 800, cache_write_input_tokens: 0, output_tokens: 150, reasoning_output_tokens: 0 } });
    expect(geminiClaimedDone(ev, 0)).toBe(true);
    expect(geminiClaimedDone(ev, 1)).toBe(false);
  });
  it("failed: result error; a bad line is unparsed and never throws", () => {
    const ev = fx("failed").flatMap(parseGeminiLine);
    expect(ev.filter((e) => e.type === "result").map((e) => e.type === "result" && [e.subtype, e.isError])).toEqual([["error", true]]);
    expect(ev.at(-1)).toEqual({ type: "unparsed", raw: "not json at all" });
    expect(geminiClaimedDone(ev, 0)).toBe(false);
    expect(parseGeminiLine("[1]")[0]?.type).toBe("unparsed");
  });
});

describe("gemini-to-stream (v5 2.1, D-423)", () => {
  it("honest-fix → init, text, tool_call/tool_result with kinds and touched paths, usage, result", () => {
    const c = createStreamCtx("r1", () => "2026-10-28T10:00:00.000Z");
    const ev = fx("honest-fix").flatMap((l) => geminiToStream(l, c));
    expect(ev.map((e) => e.kind)).toEqual(["init", "step", "text", "tool_call", "tool_result", "tool_call", "tool_result", "tool_call", "tool_result", "step", "text", "usage", "result"]);
    const calls = ev.filter((e) => e.kind === "tool_call").map((e) => [e.tool?.kind, e.tool?.name, e.tool?.touching, e.text]);
    expect(calls).toEqual([["bash", "run_shell_command", [], "npx vitest run"], ["builtin", "replace", ["src/cart.ts"], "replace src/cart.ts"], ["mandat", "mandat.ask", [], "mandat.ask"]]);
    expect(ev.filter((e) => e.kind === "tool_result").map((e) => e.tool?.decision)).toEqual(["allowed", "allowed", "error"]);
    expect(ev.find((e) => e.kind === "usage")?.usage).toEqual({ input: 1300, output: 150, cache_read: 800, cache_write: 0, context_pct: null, usd: null });
    expect(ev.at(-1)?.result).toEqual({ ok: true, claimed_done: true, error: null });
    expect(ev.map((e) => e.seq)).toEqual(ev.map((_, i) => i));
  });
  it("failed → result not ok with the message; garbage → unparsed", () => {
    const c = createStreamCtx("r2", () => "2026-10-28T10:00:00.000Z");
    const ev = fx("failed").flatMap((l) => geminiToStream(l, c));
    expect(ev.find((e) => e.kind === "result")?.result).toEqual({ ok: false, claimed_done: false, error: "Reached max session turns" });
    expect(ev.at(-1)?.kind).toBe("unparsed");
  });
});

// D-423: the live run needs a Gemini key in the proxy (or a Google login) — Simo's part (docs/reports/E9c.md)
describe("gemini live", () => {
  // D-423: no Gemini key or login in this environment; SKIPPED until Simo runs it (checklist in docs/reports/E9c.md)
  it.skip("a real `gemini -p` run through the proxy produces a parseable stream", () => undefined);
});
