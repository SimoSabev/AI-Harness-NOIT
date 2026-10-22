#!/usr/bin/env node
// PermissionRequest: record what the agent asked for (asks.jsonl → after the export the task can go HELD tool_approval,
// D-316); the decision itself stays with deny-by-policy and the CLI's own permission rules.
import { readStdin, record, toolKeys } from "./_policy.mjs";

try {
  const input = JSON.parse(await readStdin());
  for (const tool of toolKeys(input)) record("asks.jsonl", { tool, reason: "permission request" });
} catch {
  // nothing to record
}
process.exit(0);
