// E9г (D-441, fake): plays an agent that uses the builtin research server through the gate
// (http://egress-gate/mcp/research): lists the tools, searches, then tries to read a private address that came back as a
// search hit and a URL it made up — both must be refused; then the honest fix.
import { done, honestFix, init, notes } from "./_lib.mjs";

const rpc = async (url, id, method, params) => {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }), signal: AbortSignal.timeout(60000) });
  const text = await r.text();
  const data = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).pop() ?? text;
  return { status: r.status, body: data ? JSON.parse(data) : null };
};
const tool = async (url, id, name, args) => {
  const r = await rpc(url, id, "tools/call", { name, arguments: args });
  return { isError: r.body?.result?.isError === true, value: JSON.parse(r.body?.result?.content?.[0]?.text ?? "null") };
};
init();
const report = {};
const url = "http://egress-gate/mcp/research";
try {
  await rpc(url, 1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fake", version: "1" } });
  report.tools = ((await rpc(url, 2, "tools/list", {})).body?.result?.tools ?? []).map((t) => t.name).sort();
  const hits = (await tool(url, 3, "research_search", { query: "JCS key order", scope: "web" })).value?.results ?? [];
  report.hits = hits.map((h) => ({ url: h.url, provider: h.provider, id: /^src_[0-9a-f]{12}$/.test(h.source_id) }));
  const priv = hits.find((h) => h.url.startsWith("http://10."));
  report.read_private = priv ? await tool(url, 4, "research_read", { source_id: priv.source_id }) : null;
  report.read_made_up = await tool(url, 5, "research_read", { url: "https://made-up.example.org/fact" });
  report.ask = await tool(url, 6, "research_ask", { question: "q", depth: "quick" });
} catch (e) {
  report.error = String(e).slice(0, 200);
}
notes(report);
honestFix();
done();
