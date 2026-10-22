import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HOOKS = path.resolve(import.meta.dirname, "../hooks");
function run(name: string, input: unknown, policy: Record<string, unknown>, env: Record<string, string> = {}, dir = mkdtempSync(path.join(tmpdir(), "hook-"))) {
  writeFileSync(path.join(dir, "policy.json"), JSON.stringify({ version: 1, rules: [], ...policy }));
  const r = spawnSync(process.execPath, [path.join(HOOKS, `${name}.mjs`)], { input: JSON.stringify(input), cwd: dir, env: { PATH: process.env.PATH ?? "", MANDAT_HARNESS_DIR: dir, MANDAT_OUT_DIR: dir, ...env }, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, dir };
}

describe("post-tool hooks: lint / typecheck of what changed (advisory)", () => {
  it("lint-changed runs the profile's lint command with the file and returns its output as additionalContext", () => {
    const r = run("lint-changed", { hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path: "/m/work/src/a.ts" } }, { commands: { lint: "echo LINT {files}" } });
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
    expect(j.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(j.hookSpecificOutput.additionalContext).toContain("LINT src/a.ts");
  });
  it("without the command, or for another tool, it stays silent", () => {
    expect(run("lint-changed", { tool_name: "Edit", tool_input: { file_path: "src/a.ts" } }, { commands: {} }).out).toBe("");
    expect(run("typecheck-changed", { tool_name: "Read", tool_input: { file_path: "src/a.ts" } }, { commands: { typecheck: "echo TC" } }).out).toBe("");
    expect(run("typecheck-changed", { tool_name: "Write", tool_input: { file_path: "src/a.ts" } }, { commands: { typecheck: "echo TC" } }).out).toContain("TC");
  });
  it("a file name with shell characters is refused, never run", () => {
    const r = run("lint-changed", { tool_name: "Edit", tool_input: { file_path: "src/a;curl x.ts" } }, { commands: { lint: "echo LINT {files}" } });
    expect(r.out).toBe("");
  });
});

describe("stop hook: require-tests-ran", () => {
  const transcript = (lines: unknown[]) => {
    const d = mkdtempSync(path.join(tmpdir(), "tr-"));
    const f = path.join(d, "t.jsonl");
    writeFileSync(f, lines.map((l) => JSON.stringify(l)).join("\n"));
    return f;
  };
  const bash = (command: string) => ({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command } }] } });
  it("no test run in the session → blocks (exit 2) with the command; a test run → allows", () => {
    const pol = { commands: { test: "npx vitest run" } };
    const no = run("require-tests-ran", { hook_event_name: "Stop", stop_hook_active: false, transcript_path: transcript([bash("ls")]) }, pol);
    expect(no.code).toBe(2);
    expect(no.err).toContain("npx vitest run");
    expect(run("require-tests-ran", { hook_event_name: "Stop", stop_hook_active: false, transcript_path: transcript([bash("npx vitest run --reporter=dot")]) }, pol).code).toBe(0);
  });
  it("already blocked once (stop_hook_active) or no test command → allows (no loop)", () => {
    expect(run("require-tests-ran", { stop_hook_active: true, transcript_path: "/nope" }, { commands: { test: "x" } }).code).toBe(0);
    expect(run("require-tests-ran", { stop_hook_active: false, transcript_path: "/nope" }, { commands: {} }).code).toBe(0);
  });
});

describe("limit-subagents and record-ask", () => {
  it("allows up to max_subagents spawns, then blocks", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sub-"));
    const input = { hook_event_name: "PreToolUse", tool_name: "Task", tool_input: { description: "x" } };
    expect(run("limit-subagents", input, { max_subagents: 2 }, {}, dir).code).toBe(0);
    expect(run("limit-subagents", input, { max_subagents: 2 }, {}, dir).code).toBe(0);
    const third = run("limit-subagents", input, { max_subagents: 2 }, {}, dir);
    expect(third.code).toBe(2);
    expect(third.err).toContain("subagent limit 2");
    expect(run("limit-subagents", { tool_name: "Bash", tool_input: { command: "ls" } }, { max_subagents: 0 }, {}, dir).code).toBe(0);
  });
  it("record-ask writes the requested tool to asks.jsonl and lets the agent's own flow continue", () => {
    const r = run("record-ask", { hook_event_name: "PermissionRequest", tool_name: "mcp__github__create_issue", tool_input: {} }, {});
    expect(r.code).toBe(0);
    expect(existsSync(path.join(r.dir, "asks.jsonl"))).toBe(true);
    expect(readFileSync(path.join(r.dir, "asks.jsonl"), "utf8")).toContain('"tool":"mcp:github.create_issue"');
  });
});
