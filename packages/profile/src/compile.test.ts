import { Materialized, demoProfileLayers, sealProfile } from "@mandat/contract";
import type { HarnessProfile } from "@mandat/contract";
import { describe, expect, it } from "vitest";
import { RULES, claudeRule, compileProfile, ruleKind } from "./index.js";

const profile = (): HarnessProfile => sealProfile({ version: 1, repo_id: "local", layers: demoProfileLayers(), sources: {}, approved_by: null, approved_at: null });
const file = (m: Materialized, p: string) => m.files.find((f) => f.path === p);
const ctx = { runId: "r_01JABCDEFGHJKMNPQRSTVWXYZ0", subjects: ["agent:claude", "any"], skills: { "test-first": "---\nname: test-first\ndescription: Write the failing test first.\n---\nWrite the failing test first." } };

describe("rule table (E8а, v5 т. 4.1)", () => {
  it("every rule kind has a decision for every target", () => {
    for (const r of Object.values(RULES)) for (const t of ["claude", "codex", "gemini", "local"] as const) expect(["native", "harness", "unsupported"]).toContain(r[t]);
    expect(RULES.net.claude).toBe("harness");
    expect(RULES.bash.claude).toBe("native");
    expect(RULES.bash.codex).toBe("native");
    expect(RULES.bash.gemini).toBe("native"); // D-429: Gemini CLI policies TOML
  });
  it("tool patterns → Claude permission rules", () => {
    expect(ruleKind("bash:git push *")).toBe("bash");
    expect(claudeRule("bash:git push *")).toEqual(["Bash(git push *)"]);
    expect(claudeRule("path:write:infra/**")).toEqual(["Edit(infra/**)", "Write(infra/**)"]);
    expect(claudeRule("path:read:secrets/**")).toEqual(["Read(secrets/**)"]);
    expect(claudeRule("mcp:github.create_issue")).toEqual(["mcp__github__create_issue"]);
    expect(claudeRule("mcp:stripe.*")).toEqual(["mcp__stripe"]);
    expect(claudeRule("net:api.segment.io")).toEqual(["WebFetch(domain:api.segment.io)"]);
    expect(claudeRule("builtin:WebSearch")).toEqual(["WebSearch"]);
    expect(claudeRule("mandat:*")).toEqual(["mcp__mandat"]);
  });
});

describe("compile for Claude Code (E8а)", () => {
  const m = compileProfile(profile(), "claude", ctx);
  it("is a valid Materialized; deterministic", () => {
    expect(Materialized.parse(m)).toEqual(m);
    expect(compileProfile(profile(), "claude", ctx)).toEqual(m);
  });
  it("settings.json: deny/ask by subject (night rules are not for this agent), hooks to the harness scripts, managed-only instructions", () => {
    const s = JSON.parse(file(m, "claude/settings.json")?.bytes ?? "{}") as { permissions: { deny: string[]; ask: string[]; allow: string[] }; hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]>; pluginConfigs: Record<string, { options: { instructionFiles: string } }> };
    expect(s.permissions.deny).toEqual(expect.arrayContaining(["Bash(git push *)", "Bash(curl *)", "Edit(infra/**)", "Write(infra/**)"]));
    expect(s.permissions.deny).not.toContain("mcp__stripe");
    expect(s.permissions.ask).toEqual(["mcp__github__create_issue"]);
    expect(s.permissions.allow).toEqual(["Bash(npx vitest run *)", "Bash(npx vitest run)", "Bash(npx eslint *)", "Bash(npx tsc --noEmit *)", "Bash(npx tsc --noEmit)", "mcp__mandat__mandat_status", "mcp__mandat__mandat_verify"]);
    // E8g (D-352): deny-by-policy runs for every tool (an ask rule on an MCP tool must reach it), whatever matcher D had
    expect(s.hooks.PreToolUse?.[0]).toEqual({ hooks: [{ type: "command", command: "node /opt/mandat/hooks/deny-by-policy.mjs", timeout: 10 }] });
    expect(s.hooks.PostToolUse?.[0]?.hooks[0]?.command).toBe("node /opt/mandat/hooks/typecheck-changed.mjs");
    expect(s.hooks.Stop?.[0]?.hooks[0]?.command).toBe("node /opt/mandat/hooks/require-tests-ran.mjs");
    expect(s.pluginConfigs["cc-plugin-agents-md@builtin"]?.options.instructionFiles).toBe("managed-only");
  });
  it("policy.json for the hooks: the rules of this subject, the commands of layer B", () => {
    const p = JSON.parse(file(m, "policy.json")?.bytes ?? "{}") as { rules: { tool: string; decision: string }[]; commands: Record<string, string>; subjects: string[] };
    expect(p.rules.map((r) => r.tool)).toContain("bash:git push *");
    expect(p.rules.map((r) => r.tool)).not.toContain("mcp:stripe.*");
    expect(p.commands.typecheck).toBe("npx tsc --noEmit");
  });
  it("MCP through the gate, a subagent file, a skill, the instructions; files are 0444", () => {
    expect(JSON.parse(file(m, "claude/mcp.json")?.bytes ?? "{}")).toEqual({ mcpServers: { mandat: { type: "http", url: "http://egress-gate/mcp/mandat" } } });
    const agent = file(m, "claude/agents/reviewer.md")?.bytes ?? "";
    expect(agent).toContain("name: reviewer");
    expect(agent).toContain("model: claude-haiku-5-5");
    expect(agent).toContain("maxTurns: 20");
    expect(agent).toContain("permissionMode: dontAsk");
    expect(agent).toContain("tools: Read");
    expect(file(m, "claude/skills/test-first/SKILL.md")?.bytes).toContain("Write the failing test first.");
    expect(file(m, "instructions.md")?.bytes).toContain("Prices are integer cents.");
    for (const f of m.files) expect(f.mode).toBe("0444");
  });
  it("D-522: the instructions say how to run the checks: each command alone, the test command before finishing", () => {
    const md = file(m, "instructions.md")?.bytes ?? "";
    expect(md).toContain("## Running the checks");
    expect(md).toContain("Run `npx vitest run` before you finish");
    expect(md).toContain("on its own, not chained with `&&`, `;` or `|`");
  });
  it("D-707: a writer is asked for the judge's own static checks before finishing, and a check of each criterion", () => {
    const md = file(m, "instructions.md")?.bytes ?? "";
    expect(md).toContain("Run `npx tsc --noEmit` before you finish and make it pass");
    expect(md).toContain("Run `npx eslint <the files you changed>` before you finish");
    expect(md).toContain("A failure that is already there without your change is not yours");
    expect(md).toContain("check your change against each acceptance criterion of the task");
  });
  it("D-707: never the oracle's writer (its tests must stay red), and never a command the shell would refuse", () => {
    const oracle = compileProfile(profile(), "claude", { runId: "r_1", subjects: ["agent:claude"], role: "oracle" });
    const md = oracle.files.find((f) => f.path === "instructions.md")?.bytes ?? "";
    expect(md).not.toContain("npx tsc --noEmit` before you finish");
    expect(md).not.toContain("each acceptance criterion");
    const l = demoProfileLayers();
    const chained = sealProfile({ version: 1, repo_id: "local", layers: { ...l, b: { ...l.b, commands: { ...l.b.commands, typecheck: "tsc --noEmit && echo ok" } } }, sources: {}, approved_by: null, approved_at: null });
    const md2 = compileProfile(chained, "claude", { runId: "r_1", subjects: ["agent:claude"] }).files.find((f) => f.path === "instructions.md")?.bytes ?? "";
    expect(md2).not.toContain("echo ok` before you finish");
  });
  it("argv and env: settings + strict MCP; subagent limits from layer G", () => {
    expect(m.argv).toEqual(["--settings", "/m/in/harness/claude/settings.json", "--mcp-config", "/m/in/harness/claude/mcp.json", "--strict-mcp-config"]);
    expect(m.env).toEqual({ CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: "2", CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "1", CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: "3" });
  });
  it("what the harness enforces itself is listed with why", () => {
    expect(m.enforced_by_harness.map((x) => x.rule)).toEqual(expect.arrayContaining(["net:registry.npmjs.org", "path:write outside allowed_paths", "control files changed by the agent"]));
  });
  it("E8g: layer C with ask/deny rules and no deny-by-policy hook in D → the compiler adds one for every tool", () => {
    const p0 = profile();
    const p = sealProfile({ ...p0, layers: { ...p0.layers, d: p0.layers.d.filter((h) => h.script !== "deny-by-policy") } });
    const s = JSON.parse(file(compileProfile(p, "claude", ctx), "claude/settings.json")?.bytes ?? "{}") as { hooks: Record<string, { matcher?: string; hooks: { command: string }[] }[]> };
    expect(s.hooks.PreToolUse).toEqual([{ hooks: [{ type: "command", command: "node /opt/mandat/hooks/deny-by-policy.mjs", timeout: 10 }] }]);
  });
  it("snapshot", () => {
    expect(m).toMatchSnapshot();
  });
});

describe("compile for Codex (E8а)", () => {
  const m = compileProfile(profile(), "codex", { ...ctx, subjects: ["agent:codex", "any"] });
  it("config.toml: workspace-write, never ask, no network, no repo AGENTS.md, MCP through the gate, agents", () => {
    const t = file(m, "codex/config.toml")?.bytes ?? "";
    expect(t).toContain('sandbox_mode = "workspace-write"');
    expect(t).toContain('approval_policy = "never"');
    expect(t).toContain("project_doc_max_bytes = 0");
    expect(t).toContain('writable_roots = ["/m/work"]');
    expect(t).toContain("network_access = false");
    expect(t).toContain("[mcp_servers.mandat]");
    expect(t).toContain('url = "http://egress-gate/mcp/mandat"');
    expect(t).toContain('enabled_tools = ["mandat_status", "mandat_verify"]');
    expect(t).toContain("max_concurrent_threads_per_session = 2");
    expect(t).toContain("[agents.reviewer]");
    expect(t).toMatch(/developer_instructions = """[\s\S]*Prices are integer cents\.[\s\S]*"""/);
  });
  it("hooks.json: pre_tool_use → deny-by-policy; the agent file and the skill; argv + CODEX_HOME", () => {
    const h = JSON.parse(file(m, "codex/hooks.json")?.bytes ?? "{}") as { hooks: Record<string, { command: string[] }[]> };
    expect(h.hooks.pre_tool_use?.[0]?.command).toEqual(["node", "/opt/mandat/hooks/deny-by-policy.mjs"]);
    expect(h.hooks.pre_tool_use?.[0]).not.toHaveProperty("matcher");
    expect(file(m, "codex/agents/reviewer.toml")?.bytes).toContain('model = "claude-haiku-5-5"');
    expect(file(m, "codex/skills/test-first/SKILL.md")).toBeDefined();
    expect(m.argv).toEqual(["-c", 'sandbox_mode="workspace-write"', "-c", 'approval_policy="never"', "-c", "project_doc_max_bytes=0"]);
    expect(m.env).toEqual({ CODEX_HOME: "/m/codex-home" });
  });
  it("snapshot", () => {
    expect(m).toMatchSnapshot();
  });
});

describe("compile for local (prepared, E9в)", () => {
  it("only policy.json + instructions; everything else is enforced by the harness or unsupported", () => {
    for (const t of ["local"] as const) {
      const m = compileProfile(profile(), t, ctx);
      expect(m.files.map((f) => f.path).sort()).toEqual(["instructions.md", "policy.json"]);
      expect(m.unsupported.length).toBeGreaterThan(0);
      expect(m.enforced_by_harness.map((x) => x.rule)).toContain("bash:git push *");
    }
  });
});

// D-429 (spec 5.3): Gemini CLI's control layer — the system settings and the policies TOML under /m/in/harness/gemini
describe("compile for Gemini CLI (D-429)", () => {
  const g = () => compileProfile(profile(), "gemini", { ...ctx, subjects: ["agent:gemini", "any"] });
  const file = (m: ReturnType<typeof g>, p: string) => m.files.find((f) => f.path === p)?.bytes ?? "";
  it("files, argv and env: policies + instructions; --policy and --include-directories; no settings file (D-431: the CLI skips one under /m)", () => {
    const m = g();
    expect(m.files.map((f) => f.path)).toEqual(["gemini/policies/mandat.toml", "instructions.md", "policy.json"]);
    expect(m.argv).toEqual(["--policy", "/m/in/harness/gemini/policies", "--include-directories", "/m/in/harness"]);
    expect(m.env).toEqual({});
  });
  it("policies: bash deny → commandPrefix deny; ask → deny in headless with the reason; other kinds stay out of the TOML", () => {
    const toml = file(g(), "gemini/policies/mandat.toml");
    expect(toml).toBe([
      "# Mandat harness profile → Gemini CLI policy engine (D-429). Headless: ask_user would be deny anyway.",
      "",
      "[[rule]]",
      'toolName = "run_shell_command"',
      'commandPrefix = "git push"',
      'decision = "deny"',
      "priority = 900",
      'denyMessage = "the harness delivers, never the agent"',
      "",
      "[[rule]]",
      'toolName = "run_shell_command"',
      'commandPrefix = "curl"',
      'decision = "deny"',
      "priority = 900",
      'denyMessage = "no network outside the gate"',
      "",
    ].join("\n"));
    expect(toml).not.toContain("stripe");
  });
  it("glob forms: * → the whole tool; inner wildcards → commandRegex; ask → deny with the reason; allow → allow", async () => {
    const { geminiPolicyRule } = await import("./gemini.js");
    expect(geminiPolicyRule({ subject: "any", tool: "bash:*", decision: "deny", reason: "r" })).toEqual(['toolName = "run_shell_command"', 'decision = "deny"', "priority = 900", 'denyMessage = "r"']);
    expect(geminiPolicyRule({ subject: "any", tool: "bash:npm * --force", decision: "ask", reason: "a person decides" })).toEqual(['toolName = "run_shell_command"', 'commandRegex = "npm .* --force"', 'decision = "deny"', "priority = 800", 'denyMessage = "needs approval: a person decides"']);
    expect(geminiPolicyRule({ subject: "any", tool: "bash:npx vitest *", decision: "allow", reason: "" })).toEqual(['toolName = "run_shell_command"', 'commandPrefix = "npx vitest"', 'decision = "allow"', "priority = 100"]);
    expect(geminiPolicyRule({ subject: "any", tool: "path:write:infra/**", decision: "deny", reason: "r" })).toBe(null);
  });
  it("enforced by the harness and unsupported are named, never silently dropped", () => {
    const m = g();
    expect(m.enforced_by_harness.map((x) => x.rule)).toEqual(expect.arrayContaining(["path:write:infra/**", "net:registry.npmjs.org"]));
    expect(m.unsupported.map((x) => x.rule)).toEqual(expect.arrayContaining(["hooks", "mcp server mandat"]));
    expect(m.unsupported.map((x) => x.rule)).not.toContain("bash:git push *");
  });
});
