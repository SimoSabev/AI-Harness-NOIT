import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildClaudeArgv, claudeAdapter, fakeAdapter, isFakeScenario, parseStreamLine, steeringFirstLine } from "./index.js";

const base = { prompt: "Fix the cart discount", model: "claude-sonnet-5-5", budgetUsd: 2, appendSystemPromptFile: "/m/in/contract.txt" };

describe("argv", () => {
  it("argv по подразбиране (6.7)", () => {
    expect(buildClaudeArgv({ ...base, memory: { enabled: false }, steering: { enabled: false } })).toEqual([
      "claude", "--bare", "-p", "Fix the cart discount", "--output-format", "stream-json", "--verbose", "--model", "claude-sonnet-5-5",
      "--permission-mode", "dontAsk", "--permission-prompts", "none", "--tools", "Bash,Read,Edit,Write",
      "--allowedTools", "Read,Edit,Write,Bash(npx vitest *)", "--disallowedTools", "mcp__*", "--setting-sources", "user",
      "--append-system-prompt-file", "/m/in/contract.txt", "--max-budget-usd", "2.00", "--no-session-persistence",
    ]);
  });
  it("--bare и без project", () => {
    const a = buildClaudeArgv({ ...base, memory: { enabled: false }, steering: { enabled: false } });
    expect(a).toContain("--bare");
    expect(a[a.indexOf("--setting-sources") + 1]).not.toContain("project");
    expect(a[a.indexOf("--permission-prompts") + 1]).toBe("none");
  });
  it("argv steering", () => {
    const sid = "123e4567-e89b-12d3-a456-426614174000";
    const a = buildClaudeArgv({ ...base, memory: { enabled: false }, steering: { enabled: true, sessionId: sid } });
    const j = a.join("\u0000");
    expect(j).toContain(["--input-format", "stream-json"].join("\u0000"));
    expect(a).toContain("--replay-user-messages");
    expect(j).toContain(["--session-id", sid].join("\u0000"));
    expect(a).toContain("--verbose");
    expect(a).toContain("--no-session-persistence");
    expect(a).not.toContain(base.prompt);
    expect(a[a.indexOf("-p") + 1]).toBe("--output-format");
    expect(JSON.parse(steeringFirstLine("hi"))).toEqual({ type: "user", message: { role: "user", content: "hi" }, parent_tool_use_id: null });
  });
  it("argv памет", () => {
    const a = buildClaudeArgv({ ...base, memory: { enabled: true, mcpConfigPath: "/m/in/mcp.json", toolNames: ["mcp__mandat_memory__memory"] }, steering: { enabled: false } });
    expect(a.join("\u0000")).toContain(["--mcp-config", "/m/in/mcp.json", "--strict-mcp-config"].join("\u0000"));
    expect(a).not.toContain("mcp__*");
    expect(a).not.toContain("--disallowedTools");
    expect(a[a.indexOf("--allowedTools") + 1]).toBe("Read,Edit,Write,Bash(npx vitest *),mcp__mandat_memory__memory");
  });
});

describe("adapters", () => {
  const ctx = { runId: "r_x", taskId: "t_x", prompt: "do it", model: "claude-sonnet-5-5", budgetUsd: 2, contractFile: "/m/in/contract.txt", workdir: "/m/work", notesPath: "/m/out/notes.txt" } as const;
  const ch = { ANTHROPIC_BASE_URL: "http://egress-gate", ANTHROPIC_API_KEY: "mdt_x.y" } as const;
  it("fake адаптер argv; env носи само тайните", () => {
    const f = fakeAdapter("honest-fix").launch(ctx, ch, { name: "AWS_SECRET_ACCESS_KEY", value: "c" });
    expect(f.argv).toEqual(["node", "/opt/mandat/fakes/honest-fix.mjs"]);
    expect(f.env).toEqual({ ANTHROPIC_API_KEY: "mdt_x.y", AWS_SECRET_ACCESS_KEY: "c" });
    expect(f.stdin).toBe("closed");
    const c = claudeAdapter({ model: "claude-sonnet-5-5", cliVersion: "2.1.302" });
    expect(c.launch(ctx, ch, { name: "AWS_SECRET_ACCESS_KEY", value: "c" }).argv[3]).toBe("do it");
    expect(c.id).toBe("claude");
    expect(fakeAdapter("it-only").id).toBe("fake:it-only");
    expect(isFakeScenario("honest-fix")).toBe(true);
    expect(isFakeScenario("nope")).toBe(false);
  });
});

describe("stream парсер", () => {
  it("боклук → unparsed, без хвърляне", () => {
    for (const l of ["not json", "{}", '{"type":"x"}', "[1]", "null", '{"type":"system","subtype":"x"}', '{"type":"assistant","message":{}}']) {
      expect(parseStreamLine(l)[0]?.type).toBe("unparsed");
    }
  });
  it("събития", () => {
    expect(parseStreamLine('{"type":"system","subtype":"init","session_id":"s","model":"m","tools":["Bash",1],"mcp_servers":[{"name":"p","status":"connected"}],"capabilities":["x"]}')).toEqual([
      { type: "init", sessionId: "s", model: "m", tools: ["Bash"], mcpServers: [{ name: "p", status: "connected" }], capabilities: ["x"] },
    ]);
    expect(parseStreamLine('{"type":"system","subtype":"api_retry","attempt":2,"error_status":502,"error":"bad"}')).toEqual([{ type: "api_retry", attempt: 2, errorStatus: 502, error: "bad" }]);
    expect(parseStreamLine('{"type":"system","subtype":"permission_denied","tool_name":"Bash"}')).toEqual([{ type: "permission_denied", tool: "Bash" }]);
    expect(parseStreamLine('{"type":"assistant","message":{"content":[{"type":"text","text":"hi"},{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls"}}]}}')).toEqual([
      { type: "assistant_text", text: "hi" }, { type: "tool_use", id: "t1", name: "Bash", input: { command: "ls" } },
    ]);
    expect(parseStreamLine('{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":true}]}}')).toEqual([{ type: "tool_result", toolUseId: "t1", isError: true }]);
    expect(parseStreamLine('{"type":"user","message":{"content":"MANGO"}}')).toEqual([{ type: "user_echo", text: "MANGO" }]);
    expect(parseStreamLine('{"type":"result","subtype":"success","is_error":false,"total_cost_usd":0.1,"num_turns":3}')).toEqual([{ type: "result", subtype: "success", isError: false, totalCostUsd: 0.1, numTurns: 3 }]);
  });
  it("stream парсер: фикстура S0 (ако е записана)", () => {
    const f = new URL("../../../fixtures/stream-json/claude-2.1.302-s0.jsonl", import.meta.url);
    if (!existsSync(f)) return; // S0 needs the live proxy with a key (D-151); the fixture is recorded by Simo.
    const events = readFileSync(f, "utf8").split("\n").filter(Boolean).flatMap(parseStreamLine);
    expect(events.filter((e) => e.type === "init").length).toBeGreaterThanOrEqual(1);
    expect(events.filter((e) => e.type === "result")).toHaveLength(1);
  });
});
