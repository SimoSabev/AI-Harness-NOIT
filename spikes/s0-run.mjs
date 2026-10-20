// S0 (≤ $0.20): `claude --bare -p` through gate → proxy; S0b (≤ $0.10): comma-separated --allowedTools (D-023).
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { buildClaudeArgv } from "@mandat/agents";
import { repoRoot, spikeRun } from "./harness.mjs";

const argv = (prompt) => buildClaudeArgv({ prompt, model: "claude-sonnet-5-5", budgetUsd: 0.2, appendSystemPromptFile: "/m/in/contract.txt", memory: { enabled: false }, steering: { enabled: false } });
const s0 = await spikeRun({ seed: "readme", contract: "fixtures/contracts/sample.json", argv: argv("Reply with OK"), stdin: "closed", budgetUsd: 0.2 });
const init = s0.events.find((e) => e.type === "init");
const result = s0.events.filter((e) => e.type === "result");
const paths = [...new Set(s0.gateLog.filter((l) => l.kind !== "policy_loaded").map((l) => `${l.kind} ${l.method ?? ""} ${l.path ?? l.qname ?? ""}`))];
const s0ok = result.length === 1 && result[0].isError === false && (s0.usage?.requests ?? 0) > 0 && (s0.usage?.inputTokens ?? 0) > 0;
mkdirSync(path.join(repoRoot, "fixtures", "stream-json"), { recursive: true });
writeFileSync(path.join(repoRoot, "fixtures", "stream-json", "claude-2.1.302-s0.jsonl"), s0.transcript.join("\n") + "\n");

const s0b = await spikeRun({ seed: "readme", contract: "fixtures/contracts/sample.json", argv: argv("Run `npx vitest --version` with Bash, then run `ls /`"), stdin: "closed", budgetUsd: 0.1 });
const denied = s0b.events.filter((e) => e.type === "permission_denied").map((e) => e.tool);
const tools = s0b.events.filter((e) => e.type === "tool_use").map((e) => `${e.name}:${JSON.stringify(e.input).slice(0, 80)}`);
console.log(JSON.stringify({
  S0: { ok: s0ok, exit: s0.exit, result: result.map((r) => ({ subtype: r.subtype, isError: r.isError, cost: r.totalCostUsd })), usage: s0.usage, tools: init?.tools ?? null, gate: paths, runDir: s0.runDir },
  S0b: { exit: s0b.exit, tool_uses: tools, permission_denied: denied, usage: s0b.usage, note: "criterion: npx vitest --version allowed, ls / denied (D-023)" },
}, null, 2));
