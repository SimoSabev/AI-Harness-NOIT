// E8g (AC-8.1, fake): plays Claude Code calling an MCP tool that the profile marks "ask". It runs the harness PreToolUse
// hook the way the CLI would: refused (exit 2, asks.jsonl) → nothing changes; allowed (a person said yes) → the honest fix.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { done, honestFix, init } from "./_lib.mjs";

const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
init();
const argv = process.argv.slice(2);
const at = argv.indexOf("--settings");
const settings = JSON.parse(readFileSync(at >= 0 ? argv[at + 1] : "/m/in/harness/claude/settings.json", "utf8"));
const [cmd, ...args] = (settings.hooks?.PreToolUse?.[0]?.hooks?.[0]?.command ?? "").split(" ");
out({ type: "assistant", message: { content: [{ type: "tool_use", id: "toolu_issue", name: "mcp__github__create_issue", input: { title: "x" } }] }, parent_tool_use_id: null });
const r = spawnSync(cmd, args, { input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "mcp__github__create_issue", tool_input: { title: "x" } }), encoding: "utf8" });
if (r.status === 2) {
  out({ type: "system", subtype: "permission_denied", tool_name: "mcp__github__create_issue", tool_use_id: "toolu_issue" });
  out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_issue", content: (r.stderr ?? "").trim(), is_error: true }] }, parent_tool_use_id: null });
} else {
  out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_issue", content: "created", is_error: false }] }, parent_tool_use_id: null });
  honestFix();
}
done();
