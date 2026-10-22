import { describe, expect, it } from "vitest";
import { CLAUDE_HARNESS_SETTINGS, buildClaudeArgv, claudeAdapter, sh2Settings } from "./index.js";

const base = { prompt: "Fix the cart discount", model: "claude-sonnet-5-5", budgetUsd: 2, appendSystemPromptFile: "/m/in/contract.txt", memory: { enabled: false as const }, steering: { enabled: false as const } };
const ctx = { runId: "r_01JABCDEFGHJKMNPQRSTVWXYZ0", taskId: "t_x", prompt: "fix", model: "claude-sonnet-5-5", budgetUsd: 2, contractFile: "/m/in/contract.txt" as const, workdir: "/m/work" as const, notesPath: "/m/out/notes.txt" as const };
const canary = { name: "AWS_SECRET_ACCESS_KEY" as const, value: "canary" };

describe("Claude Code control layer variants (SH2, D-312)", () => {
  it("A: today's --bare argv plus --settings from the harness dir", () => {
    const a = buildClaudeArgv({ ...base, control: { variant: "A", settingsFile: CLAUDE_HARNESS_SETTINGS, mcpConfigFile: null } });
    expect(a.slice(0, 3)).toEqual(["claude", "--bare", "-p"]);
    expect(a.join("\u0000")).toContain(["--settings", CLAUDE_HARNESS_SETTINGS].join("\u0000"));
    expect(a[a.indexOf("--setting-sources") + 1]).toBe("user");
  });
  it("B: no --bare; user settings only; strict MCP from the harness; dontAsk, no prompts", () => {
    const b = buildClaudeArgv({ ...base, control: { variant: "B", settingsFile: CLAUDE_HARNESS_SETTINGS, mcpConfigFile: "/m/in/harness/claude/mcp.json" } });
    expect(b).not.toContain("--bare");
    const j = b.join("\u0000");
    expect(j).toContain(["--settings", CLAUDE_HARNESS_SETTINGS].join("\u0000"));
    expect(j).toContain(["--mcp-config", "/m/in/harness/claude/mcp.json", "--strict-mcp-config"].join("\u0000"));
    expect(j).toContain(["--permission-mode", "dontAsk"].join("\u0000"));
    expect(j).toContain(["--permission-prompts", "none"].join("\u0000"));
    expect(b[b.indexOf("--setting-sources") + 1]).toBe("user");
    const noMcp = buildClaudeArgv({ ...base, control: { variant: "B", settingsFile: CLAUDE_HARNESS_SETTINGS, mcpConfigFile: null } });
    expect(noMcp).toContain("--strict-mcp-config");
    expect(noMcp[noMcp.indexOf("--disallowedTools") + 1]).toBe("mcp__*");
  });
  it("without a control layer the argv is unchanged (E0 6.7)", () => {
    expect(buildClaudeArgv(base)).toEqual(buildClaudeArgv({ ...base, control: undefined }));
  });
  it("D-342: a subscription profile never runs --bare (bare mode does not read OAuth credentials)", () => {
    const spec = claudeAdapter({ model: "claude-sonnet-5-5", cliVersion: "2.1.302" }).launch(ctx, { PROFILE: true }, canary);
    expect(spec.argv).not.toContain("--bare");
    expect(spec.argv).toContain("--strict-mcp-config");
    const key = claudeAdapter({ model: "claude-sonnet-5-5", cliVersion: "2.1.302" }).launch(ctx, { ANTHROPIC_BASE_URL: "http://egress-gate", ANTHROPIC_API_KEY: "mdt_x" }, canary);
    expect(key.argv).toContain("--bare");
  });
  it("SH2 settings: deny git push, the PreToolUse hook, managed-only instruction files", () => {
    const s = sh2Settings();
    expect(s.permissions.deny).toContain("Bash(git push *)");
    expect(s.hooks.PreToolUse[0]?.hooks[0]?.command).toBe("node /opt/mandat/hooks/deny-by-policy.mjs");
    expect(s.pluginConfigs["cc-plugin-agents-md@builtin"].options.instructionFiles).toBe("managed-only");
    expect(s.disableAllHooks).toBeUndefined();
  });
});
