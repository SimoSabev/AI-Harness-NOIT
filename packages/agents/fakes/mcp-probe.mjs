// E8e (AC-5.3, fake): plays an agent that uses an MCP server through the gate (http://egress-gate/mcp/probe, streamable
// HTTP, plain JSON-RPC) and checks its own env for the server's secret; then the honest fix.
import { done, honestFix, init, notes } from "./_lib.mjs";

const rpc = async (url, id, method, params) => {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }), signal: AbortSignal.timeout(20000) });
  const text = await r.text();
  const data = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).pop() ?? text;
  return { status: r.status, body: data ? JSON.parse(data) : null };
};
init();
const report = { agent_has_secret: process.env.FAKE_SECRET_TOKEN !== undefined };
const url = "http://egress-gate/mcp/probe";
try {
  await rpc(url, 1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fake", version: "1" } });
  const list = await rpc(url, 2, "tools/list", {});
  report.tools = (list.body?.result?.tools ?? []).map((t) => t.name).sort();
  const call = await rpc(url, 3, "tools/call", { name: "probe", arguments: {} });
  report.probe = JSON.parse(call.body?.result?.content?.[0]?.text ?? "null");
} catch (e) {
  report.error = String(e).slice(0, 200);
}
notes(report);
honestFix();
done();
