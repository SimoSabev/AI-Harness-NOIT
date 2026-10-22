#!/usr/bin/env node
// Stop: the agent may not finish before it ran the profile's test command in this session (v5 E8а). Blocks once
// (stop_hook_active → allow, so there is no loop; the CLI also caps it with CLAUDE_CODE_STOP_HOOK_BLOCK_CAP).
import { readFileSync } from "node:fs";
import { loadPolicy, readStdin } from "./_policy.mjs";

try {
  const input = JSON.parse(await readStdin());
  const test = loadPolicy().commands?.test;
  if (input?.stop_hook_active === true || typeof test !== "string" || test.length === 0) process.exit(0);
  const head = test.split(/\s+/).slice(0, 3).join(" ");
  let ran = false;
  try {
    for (const line of readFileSync(String(input?.transcript_path ?? ""), "utf8").split("\n")) {
      if (line.includes('"tool_use"') && line.includes(head)) {
        ran = true;
        break;
      }
    }
  } catch {
    ran = false;
  }
  if (ran) process.exit(0);
  process.stderr.write(`Run the tests before finishing: ${test}\n`);
  process.exit(2);
} catch {
  process.exit(0);
}
