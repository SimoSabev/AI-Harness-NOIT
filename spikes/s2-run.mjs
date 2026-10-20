// S2 (≤ $0.30): stdin stream-json while the agent works (steering, D-021). Measures echo latency and the reply.
import { randomUUID } from "node:crypto";
import { buildClaudeArgv, steeringFirstLine } from "@mandat/agents";
import { spikeRun } from "./harness.mjs";

const argv = buildClaudeArgv({ prompt: "", model: "claude-sonnet-5-5", budgetUsd: 0.3, appendSystemPromptFile: "/m/in/contract.txt", memory: { enabled: false }, steering: { enabled: true, sessionId: randomUUID() } });
let sentAt = null;
const r = await spikeRun({
  seed: "shop", contract: "contracts/fix-discount.json", argv, stdin: "pipe", budgetUsd: 0.3,
  firstStdinLine: steeringFirstLine("Use Bash to run `sleep 15 && echo done`. Then reply with exactly the code word the human gives you, or NONE."),
  onStdoutLine(line, ctl) {
    let j;
    try {
      j = JSON.parse(line);
    } catch {
      return;
    }
    const hasToolUse = j.type === "assistant" && Array.isArray(j.message?.content) && j.message.content.some((b) => b.type === "tool_use");
    if (hasToolUse && sentAt === null) {
      sentAt = Date.now();
      ctl.write(JSON.stringify({ type: "user", message: { role: "user", content: `Съобщение от човека №1 (owner, ${new Date().toISOString().slice(11, 16)}): the code word is MANGO` }, parent_tool_use_id: null }));
    }
    if (j.type === "result") ctl.end();
  },
});
const echo = r.events.find((e) => e.type === "user_echo" && e.text.includes("MANGO"));
const finalText = r.events.filter((e) => e.type === "assistant_text").map((e) => e.text).join("\n");
console.log(JSON.stringify({
  echo_after_ms: echo ? echo.t : null,
  mango_in_reply: /MANGO/.test(finalText),
  results: r.events.filter((e) => e.type === "result").length,
  capabilities: r.events.find((e) => e.type === "init")?.capabilities ?? null,
  usage: r.usage, runDir: r.runDir,
}, null, 2));
