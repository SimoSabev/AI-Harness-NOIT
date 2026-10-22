import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { matchTool, toolKeys } from "../hooks/_policy.mjs";

const HOOKS = path.resolve(import.meta.dirname, "../hooks");
function hook(name: string, input: unknown, rules: unknown[]): { code: number | null; stderr: string; out: string } {
  const d = mkdtempSync(path.join(tmpdir(), "hook-"));
  writeFileSync(path.join(d, "policy.json"), JSON.stringify({ version: 1, rules }));
  const r = spawnSync(process.execPath, [path.join(HOOKS, `${name}.mjs`)], {
    input: JSON.stringify(input),
    env: { PATH: process.env.PATH ?? "", MANDAT_HARNESS_DIR: d, MANDAT_OUT_DIR: d },
    encoding: "utf8",
  });
  const out = ["hooks.jsonl", "asks.jsonl"].map((f) => (existsSync(path.join(d, f)) ? readFileSync(path.join(d, f), "utf8") : "")).join("|");
  return { code: r.status, stderr: r.stderr, out };
}
const PUSH = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "git push origin HEAD" } };
const DENY_PUSH = { tool: "bash:git push *", decision: "deny", reason: "the harness delivers" };

describe("hook deny-by-policy (v5 E8а, SH2)", () => {
  it("git push → exit 2 with the reason on stderr; a marker line is written", () => {
    const r = hook("deny-by-policy", PUSH, [DENY_PUSH]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("the harness delivers");
    expect(r.out).toContain('"decision":"deny"');
  });
  it("compound commands are checked per segment; wrappers are stripped", () => {
    expect(hook("deny-by-policy", { ...PUSH, tool_input: { command: "npm test && timeout 5 git push" } }, [DENY_PUSH]).code).toBe(2);
    expect(hook("deny-by-policy", { ...PUSH, tool_input: { command: "git status; echo ok" } }, [DENY_PUSH]).code).toBe(0);
  });
  it("ask → exit 2 'needs approval' and a line in asks.jsonl", () => {
    const r = hook("deny-by-policy", { tool_name: "mcp__github__create_issue", tool_input: { title: "x" } }, [{ tool: "mcp:github.create_issue", decision: "ask", reason: "a human decides" }]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("needs approval: mcp:github.create_issue");
    expect(r.out).toContain('"tool":"mcp:github.create_issue"');
  });
  it("deny beats allow; no rule → allowed (exit 0)", () => {
    expect(hook("deny-by-policy", PUSH, [{ tool: "bash:git *", decision: "allow", reason: "" }, DENY_PUSH]).code).toBe(2);
    expect(hook("deny-by-policy", { tool_name: "Bash", tool_input: { command: "npx vitest run" } }, [DENY_PUSH]).code).toBe(0);
  });
  it("path rules for writes; Codex-style input (command array)", () => {
    expect(hook("deny-by-policy", { tool_name: "Edit", tool_input: { file_path: "/m/work/infra/main.tf" } }, [{ tool: "path:write:infra/**", decision: "deny", reason: "infra" }]).code).toBe(2);
    expect(hook("deny-by-policy", { tool_name: "Edit", tool_input: { file_path: "src/cart.ts" } }, [{ tool: "path:write:infra/**", decision: "deny", reason: "infra" }]).code).toBe(0);
    expect(hook("deny-by-policy", { tool_name: "shell", tool_input: { command: ["bash", "-lc", "git push"] } }, [DENY_PUSH]).code).toBe(2);
  });
  it("bad input or a missing policy fails closed (exit 2)", () => {
    const d = mkdtempSync(path.join(tmpdir(), "hook-"));
    const r = spawnSync(process.execPath, [path.join(HOOKS, "deny-by-policy.mjs")], { input: "{", env: { PATH: process.env.PATH ?? "", MANDAT_HARNESS_DIR: d, MANDAT_OUT_DIR: d }, encoding: "utf8" });
    expect(r.status).toBe(2);
  });
  it("pattern semantics", () => {
    expect(toolKeys({ tool_name: "WebFetch", tool_input: { url: "https://api.segment.io/v1" } })).toEqual(["net:api.segment.io"]);
    expect(matchTool("bash:git push *", "bash:git push")).toBe(true);
    expect(matchTool("bash:git push *", "bash:git pushx")).toBe(false);
    expect(matchTool("path:write:infra/*", "path:write:infra/a/b.tf")).toBe(false);
    expect(matchTool("path:write:infra/**", "path:write:infra/a/b.tf")).toBe(true);
    expect(matchTool("mcp:stripe.*", "mcp:stripe.charge")).toBe(true);
  });
});
