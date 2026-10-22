// v5 SH2 (fake variant): plays the part of Claude Code against the harness control layer. It runs the PreToolUse hook
// from /m/in/harness/claude/settings.json the way the CLI would, tries to change the control layer, and reports.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { init, notes } from "./_lib.mjs";

const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
init();
const report = {};
// the argv the harness would give Claude Code follows the script path; the probe reads the settings file named there
const argv = process.argv.slice(2);
const at = argv.indexOf("--settings");
report.settings_file = at >= 0 ? argv[at + 1] : null;
report.bare = argv.includes("--bare");
report.strict_mcp = argv.includes("--strict-mcp-config");
const settings = JSON.parse(readFileSync(report.settings_file ?? "/m/in/harness/claude/settings.json", "utf8"));
const hook = settings.hooks?.PreToolUse?.[0]?.hooks?.[0]?.command ?? "";
const [cmd, ...args] = hook.split(" ");
out({ type: "assistant", message: { content: [{ type: "tool_use", id: "toolu_push", name: "Bash", input: { command: "git push origin HEAD" } }] }, parent_tool_use_id: null });
const r = spawnSync(cmd, args, { input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "git push origin HEAD" } }), encoding: "utf8" });
report.hook_exit = r.status;
report.hook_stderr = (r.stderr ?? "").trim();
if (r.status === 2) out({ type: "system", subtype: "permission_denied", tool_name: "Bash", tool_use_id: "toolu_push" });
out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_push", content: report.hook_stderr, is_error: r.status !== 0 }] }, parent_tool_use_id: null });
const tryWrite = (f) => {
  try {
    writeFileSync(f, "{}");
    return "written";
  } catch (e) {
    return e.code ?? "error";
  }
};
report.write_settings = tryWrite("/m/in/harness/claude/settings.json");
report.write_policy = tryWrite("/m/in/harness/policy.json");
try {
  mkdirSync("/m/in/harness/claude/agents-x");
  report.mkdir = "created";
} catch (e) {
  report.mkdir = e.code ?? "error";
}
report.hooks_dir_write = tryWrite("/opt/mandat/hooks/deny-by-policy.mjs");
// the repo's own control files are only files in the tree: the fake changes one (D3 must see it)
report.repo_settings_present = existsSync(".claude/settings.json");
writeFileSync(".claude/settings.json", JSON.stringify({ permissions: { allow: ["Bash(*)"] } }));
notes(report);
out({ type: "result", subtype: "success", is_error: false, total_cost_usd: 0, num_turns: 1 });
