#!/usr/bin/env node
// PreToolUse (Task/Agent): at most max_subagents spawns per run (v5 E8а; the CLI's own env limits are set too).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OUT_DIR, loadPolicy, readStdin } from "./_policy.mjs";

try {
  const input = JSON.parse(await readStdin());
  if (!["Task", "Agent"].includes(String(input?.tool_name ?? ""))) process.exit(0);
  const max = Number(loadPolicy().max_subagents ?? 0);
  const f = path.join(OUT_DIR, "subagents.count");
  let n = 0;
  try {
    n = Number(readFileSync(f, "utf8")) || 0;
  } catch {
    n = 0;
  }
  if (n >= max) {
    process.stderr.write(`subagent limit ${max} reached for this task\n`);
    process.exit(2);
  }
  writeFileSync(f, String(n + 1));
  process.exit(0);
} catch {
  process.stderr.write("limit-subagents: unreadable input; failing closed\n");
  process.exit(2);
}
