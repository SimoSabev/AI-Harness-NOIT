#!/usr/bin/env node
// PreToolUse (Claude) / pre_tool_use (Codex): deny → exit 2 + reason; ask → asks.jsonl + exit 2 "needs approval";
// anything unreadable fails closed (exit 2). D-316: "ask" is a refusal now and a human card after the export.
import { decide, loadPolicy, readStdin, record, toolKeys } from "./_policy.mjs";

try {
  const input = JSON.parse(await readStdin());
  const keys = toolKeys(input);
  const d = decide(loadPolicy(), keys);
  record("hooks.jsonl", { hook: "deny-by-policy", tool: d.tool, decision: d.decision });
  if (d.decision === "deny") {
    process.stderr.write(`denied by policy: ${d.reason || d.tool}\n`);
    process.exit(2);
  }
  if (d.decision === "ask") {
    record("asks.jsonl", { tool: d.tool, reason: d.reason });
    process.stderr.write(`needs approval: ${d.tool}${d.reason ? ` (${d.reason})` : ""}\n`);
    process.exit(2);
  }
  process.exit(0);
} catch (e) {
  record("hooks.jsonl", { hook: "deny-by-policy", tool: "", decision: "error" });
  process.stderr.write(`deny-by-policy: ${e instanceof Error ? e.message.slice(0, 200) : "error"}; failing closed\n`);
  process.exit(2);
}
