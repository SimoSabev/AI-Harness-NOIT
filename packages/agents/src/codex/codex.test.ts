import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { codexAdapter } from "./adapter.js";
import { buildCodexArgv } from "./argv.js";
import { codexClaimedDone, parseCodexLine } from "./stream.js";
import { claudeAdapter } from "../claude/adapter.js";
import { fakeCodexAdapter } from "../fake/adapter.js";
import { isFakeCodexScenario } from "../adapter.js";

// Демо промпт т. 8.3: codex-argv (точният масив) и codex-parse (fixtures/codex-jsonl; синтетични до S-CX, D-288).
const fx = (n: string) => readFileSync(new URL(`../../../../fixtures/codex-jsonl/${n}.jsonl`, import.meta.url), "utf8").split("\n").filter(Boolean);
const ctx = { runId: "r1", taskId: "t1", prompt: "Fix it", model: "m", budgetUsd: 1, contractFile: "/m/in/contract.txt" as const, workdir: "/m/work" as const, notesPath: "/m/out/notes.txt" as const };
const canary = { name: "AWS_SECRET_ACCESS_KEY" as const, value: "c" };

describe("codex-argv", () => {
  it("точният масив (D-222)", () => {
    expect(buildCodexArgv({ model: "gpt-5-codex", prompt: "Fix it" })).toEqual([
      "codex", "exec", "--json", "--ephemeral", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules",
      "-m", "gpt-5-codex", "-s", "workspace-write", "-C", "/m/work", "-o", "/m/out/notes.txt",
      "-c", 'model_provider="mandat"', "-c", 'model_providers.mandat.name="mandat"', "-c", 'model_providers.mandat.base_url="http://egress-gate/v1"',
      "-c", 'model_providers.mandat.env_key="OPENAI_API_KEY"', "-c", 'model_providers.mandat.wire_api="responses"', "-c", "project_doc_max_bytes=0", "Fix it",
    ]);
  });
  it("env: само mdt_ токенът като OPENAI_API_KEY (CODEX_HOME е публична env на фазата); anthropic канал → грешка", () => {
    const l = codexAdapter({ model: "gpt-5-codex", cliVersion: "0.160.1" }).launch(ctx, { OPENAI_API_KEY: "mdt_x" }, canary);
    expect(l.env).toEqual({ OPENAI_API_KEY: "mdt_x", AWS_SECRET_ACCESS_KEY: "c" });
    expect(() => codexAdapter({ model: "m", cliVersion: "0.160.1" }).launch(ctx, { ANTHROPIC_BASE_URL: "http://egress-gate", ANTHROPIC_API_KEY: "mdt_y" }, canary)).toThrow();
    expect(() => claudeAdapter({ model: "m", cliVersion: "2.1.302" }).launch(ctx, { OPENAI_API_KEY: "mdt_x" }, canary)).toThrow();
  });
  it("fake-codex", () => {
    expect(isFakeCodexScenario("honest-fix")).toBe(true);
    expect(isFakeCodexScenario("nope")).toBe(false);
    const l = fakeCodexAdapter("honest-fix").launch(ctx, { OPENAI_API_KEY: "mdt_x" }, canary);
    expect(l.argv).toEqual(["node", "/opt/mandat/fakes/codex-honest-fix.mjs"]);
    expect(l.env.OPENAI_API_KEY).toBe("mdt_x");
  });
});

describe("codex-parse", () => {
  it("honest-fix: init, assistant_text, result с usage; claimedDone", () => {
    const ev = fx("honest-fix").flatMap(parseCodexLine);
    expect(ev[0]).toMatchObject({ type: "init", sessionId: "0199fake-0000-7000-8000-000000000001" });
    expect(ev.filter((e) => e.type === "assistant_text")).toEqual([{ type: "assistant_text", text: "Fixed the discount threshold in src/cart.ts." }]);
    expect(ev[ev.length - 1]).toEqual({ type: "result", subtype: "success", isError: false, totalCostUsd: null, numTurns: null, usage: { input_tokens: 1200, cached_input_tokens: 800, cache_write_input_tokens: 100, output_tokens: 90, reasoning_output_tokens: 40 } });
    expect(codexClaimedDone(ev, 0)).toBe(true);
    expect(codexClaimedDone(ev, 1)).toBe(false);
  });
  it("turn.failed / error → result isError; друго → unparsed; лош JSON не хвърля", () => {
    const ev = fx("failed").flatMap(parseCodexLine);
    expect(ev.filter((e) => e.type === "result").map((e) => e.type === "result" && e.isError)).toEqual([true, true]);
    expect(codexClaimedDone(ev, 0)).toBe(false);
    expect(parseCodexLine("{nope")).toEqual([{ type: "unparsed", raw: "{nope" }]);
    expect(parseCodexLine("[1]")[0]?.type).toBe("unparsed");
  });
  it("инструменти: command_execution, file_change, mcp_tool_call, web_search → tool_use/tool_result (D-308)", () => {
    const L = (o: object) => parseCodexLine(JSON.stringify(o));
    expect(L({ type: "item.started", item: { id: "i1", type: "command_execution", command: "pnpm test", aggregated_output: "", exit_code: null, status: "in_progress" } })).toEqual([
      { type: "tool_use", id: "i1", name: "Bash", input: { command: "pnpm test" } },
    ]);
    expect(L({ type: "item.completed", item: { id: "i1", type: "command_execution", command: "pnpm test", aggregated_output: "x", exit_code: 1, status: "failed" } })).toEqual([
      { type: "tool_use", id: "i1", name: "Bash", input: { command: "pnpm test" } },
      { type: "tool_result", toolUseId: "i1", isError: true },
    ]);
    expect(L({ type: "item.completed", item: { id: "i2", type: "file_change", changes: [{ path: "src/cart.ts", kind: "update" }, { path: "src/b.ts", kind: "add" }], status: "completed" } })).toEqual([
      { type: "tool_use", id: "i2", name: "Edit", input: { paths: ["src/cart.ts", "src/b.ts"] } },
      { type: "tool_result", toolUseId: "i2", isError: false },
    ]);
    expect(L({ type: "item.started", item: { id: "i3", type: "mcp_tool_call", server: "postgres", tool: "query", arguments: { sql: "select 1" }, result: null, error: null, status: "in_progress" } })).toEqual([
      { type: "tool_use", id: "i3", name: "mcp__postgres__query", input: { sql: "select 1" } },
    ]);
    expect(L({ type: "item.completed", item: { id: "i4", type: "web_search", query: "zod refine", action: {} } })).toEqual([
      { type: "tool_use", id: "i4", name: "WebSearch", input: { query: "zod refine" } },
      { type: "tool_result", toolUseId: "i4", isError: false },
    ]);
    expect(L({ type: "item.completed", item: { id: "i5", type: "command_execution", command: "rm -rf /", aggregated_output: "", exit_code: null, status: "declined" } })).toEqual([
      { type: "tool_use", id: "i5", name: "Bash", input: { command: "rm -rf /" } },
      { type: "permission_denied", tool: "Bash" },
    ]);
    expect(L({ type: "item.started", item: { id: "i6", type: "reasoning", text: "…" } })[0]?.type).toBe("unparsed");
  });
});
