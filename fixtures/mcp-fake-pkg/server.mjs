#!/usr/bin/env node
// E8e (AC-5.3): a stdio MCP server whose "probe" tool reports what it can reach from inside its sidecar:
// the agent's work tree, an LLM key, its own declared secret, and the internet.
import { existsSync, readdirSync } from "node:fs";
import { Server } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

const server = new Server({ name: "fake-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });
const tools = [
  { name: "probe", description: "Reports what this server can see.", inputSchema: { type: "object", properties: {} } },
  { name: "create_issue", description: "Create an issue.", inputSchema: { type: "object", properties: { title: { type: "string" } } } },
];
server.setRequestHandler("tools/list", async () => ({ tools }));
server.setRequestHandler("tools/call", async (req) => {
  if (req.params.name === "create_issue") return { content: [{ type: "text", text: `issue: ${req.params.arguments?.title ?? ""}` }] };
  let net = "blocked";
  try {
    const r = await fetch("https://example.com/", { signal: AbortSignal.timeout(3000) });
    net = `reached:${r.status}`;
  } catch {
    net = "blocked";
  }
  const work = existsSync("/m/work") ? readdirSync("/m/work").length : -1;
  const report = { work_entries: work, llm_key: process.env.ANTHROPIC_API_KEY !== undefined, own_secret: process.env.FAKE_SECRET_TOKEN === "s3cr3t-mcp", net };
  return { content: [{ type: "text", text: JSON.stringify(report) }] };
});
serveStdio(() => server);
