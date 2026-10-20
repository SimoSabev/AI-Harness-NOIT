#!/usr/bin/env node
// Спайк SH (демо промпт т. 7.6) — НЕ е част от демото. Stop hook за Claude Code и Codex: вика mandat-verify и блокира
// при FAILED (exit 2, причината на stderr отива при агента). Вход: JSON на stdin (общите полета + stop_hook_active).
// MANDAT_SH_REMOTE = доверения remote; MANDAT_VERIFY_BIN = пътя до packages/verify/dist/main.js.
import { spawnSync } from "node:child_process";

let raw = "";
for await (const c of process.stdin) raw += c;
let input;
try {
  input = JSON.parse(raw || "{}");
} catch {
  input = {};
}
// Claude Code: never block twice in a row on the same stop (CLAUDE_CODE_STOP_HOOK_BLOCK_CAP is 8; we stop at 1).
if (input.stop_hook_active === true) process.exit(0);
const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
const remote = process.env.MANDAT_SH_REMOTE;
const bin = process.env.MANDAT_VERIFY_BIN;
if (!remote || !bin) {
  process.stderr.write("mandat stop hook: MANDAT_SH_REMOTE / MANDAT_VERIFY_BIN not set — not checking\n");
  process.exit(0);
}
const r = spawnSync(process.execPath, [bin, "--repo", cwd, "--remote", remote, "--external", "--json"], { encoding: "utf8", timeout: 15 * 60_000 });
const last = (r.stdout ?? "").trim().split("\n").filter(Boolean).at(-1) ?? "{}";
let out;
try {
  out = JSON.parse(last);
} catch {
  out = {};
}
const result = out.verdict?.result;
if (result === "FAILED") {
  process.stderr.write(`Mandat: FAILED — ${(out.verdict.reasons ?? []).slice(0, 3).join(", ")}. Fix the change; do not delete or weaken tests.\n`);
  process.exit(2);
}
process.exit(0);
