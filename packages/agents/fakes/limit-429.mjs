// E3в (сцена 2): one real call through the gate → proxy → upstream; on 429 it reports the limit like Claude Code
// (system/api_retry + an error result) and exits 1 without changing the tree.
import { init } from "./_lib.mjs";

init();
let status;
try {
  const r = await fetch("http://egress-gate/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 16, messages: [{ role: "user", content: "hi" }] }),
  });
  status = r.status;
  await r.arrayBuffer();
} catch {
  status = 0;
}
process.stdout.write(JSON.stringify({ type: "system", subtype: "api_retry", attempt: 1, error_status: status, error: status === 429 ? "rate_limit" : "unknown" }) + "\n");
process.stdout.write(JSON.stringify({ type: "result", subtype: "error_during_execution", is_error: true, total_cost_usd: 0, num_turns: 0 }) + "\n");
process.exit(1);
