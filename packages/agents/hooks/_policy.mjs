// Harness hooks (v5 E8а, D-311): ESM, no dependencies; copied into the sandbox image at /opt/mandat/hooks (ro).
// The policy is /m/in/harness/policy.json, written by the profile compiler (seed container, root, 0444).
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";

export const HARNESS_DIR = process.env.MANDAT_HARNESS_DIR ?? "/m/in/harness";
export const OUT_DIR = process.env.MANDAT_OUT_DIR ?? "/m/out";
const WRAPPERS = new Set(["timeout", "time", "nice", "nohup", "stdbuf", "command", "builtin", "noglob", "env", "sudo"]);
const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit", "apply_patch"]);

export async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

export function loadPolicy() {
  const p = JSON.parse(readFileSync(path.join(HARNESS_DIR, "policy.json"), "utf8"));
  if (!p || !Array.isArray(p.rules)) throw new Error("policy.json: no rules");
  return p;
}

function rel(p) {
  let s = String(p);
  if (s.startsWith("/m/work/")) s = s.slice(8);
  while (s.startsWith("./")) s = s.slice(2);
  return s;
}

/** Splits a shell command into simple commands (&&, ||, ;, |, &, newline) and strips wrappers like `timeout 5`. */
export function segments(cmd) {
  return String(cmd)
    .split(/&&|\|\||\|&|[;|&\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const w = s.split(/\s+/);
      while (w.length > 1 && WRAPPERS.has(w[0])) {
        w.shift();
        while (w.length > 1 && /^(-\S*|\d+[smhd]?|[A-Z_]+=\S*)$/.test(w[0])) w.shift();
      }
      return w.join(" ");
    });
}

/** The pattern keys of one tool call (Claude PreToolUse or Codex pre_tool_use input). */
export function toolKeys(input) {
  const name = String(input?.tool_name ?? input?.tool ?? "");
  const ti = input?.tool_input ?? input?.input ?? {};
  let cmd = ti.command ?? input?.command;
  if (Array.isArray(cmd)) cmd = cmd.length >= 3 && /^(ba|z)?sh$/.test(String(cmd[0]).split("/").pop()) && /^-l?c$/.test(cmd[1]) ? cmd.slice(2).join(" ") : cmd.join(" ");
  if (name === "Bash" || name === "shell" || name === "exec_command" || (cmd !== undefined && !WRITE_TOOLS.has(name))) return segments(cmd ?? "").map((s) => `bash:${s}`);
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  if (m) return [`mcp:${m[1]}.${m[2]}`];
  if (WRITE_TOOLS.has(name)) return [ti.file_path ?? ti.path ?? ti.notebook_path].filter(Boolean).map((p) => `path:write:${rel(p)}`);
  if (name === "Read") return [ti.file_path ?? ti.path].filter(Boolean).map((p) => `path:read:${rel(p)}`);
  if (name === "WebFetch" || name === "web_fetch") {
    try {
      return [`net:${new URL(ti.url).hostname}`];
    } catch {
      return ["net:invalid"];
    }
  }
  if (name === "Skill") return [`skill:${ti.skill ?? ti.name ?? ""}`];
  return [`builtin:${name}`];
}

const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
/** `*` = any run (no "/" for path patterns), `**` = anything; "bash:x *" also matches "bash:x". */
export function matchTool(pattern, key) {
  const isPath = pattern.startsWith("path:");
  let p = pattern;
  let optionalTail = false;
  if (p.startsWith("bash:") && p.endsWith(" *")) {
    p = p.slice(0, -2);
    optionalTail = true;
  }
  const body = esc(p)
    .split("**")
    .map((part) => part.replace(/\*/g, isPath ? "[^/]*" : ".*"))
    .join(".*");
  return new RegExp(`^${body}${optionalTail ? "(?: .*)?" : ""}$`).test(key);
}

/** deny > ask > allow; no matching rule → allow (the agent's own allowlist still applies). */
export function decide(policy, keys) {
  let best = { decision: "allow", reason: "", tool: keys[0] ?? "" };
  const rank = { allow: 0, ask: 1, deny: 2 };
  for (const key of keys) {
    for (const r of policy.rules) {
      if (matchTool(r.tool, key) && rank[r.decision] > rank[best.decision]) best = { decision: r.decision, reason: r.reason ?? "", tool: r.tool };
    }
  }
  return best;
}

export function record(file, obj) {
  try {
    appendFileSync(path.join(OUT_DIR, file), JSON.stringify({ ts: new Date().toISOString(), ...obj }) + "\n");
  } catch {
    // /m/out missing (outside the sandbox): the decision still stands
  }
}
