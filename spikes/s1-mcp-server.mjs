// S1: a minimal MCP server (Streamable HTTP on :3000/mcp) with one tool "echo". Logs every tools/call to stdout.
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

function server() {
  const s = new McpServer({ name: "mandat-probe", version: "0.0.0" });
  s.registerTool("echo", { description: "Echo the given text", inputSchema: { text: z.string() } }, async ({ text }) => {
    console.log(JSON.stringify({ event: "tools/call", tool: "echo", text }));
    return { content: [{ type: "text", text }] };
  });
  return s;
}

http
  .createServer(async (req, res) => {
    if (!req.url?.startsWith("/mcp")) {
      res.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => transport.close());
    await server().connect(transport);
    await transport.handleRequest(req, res, body);
  })
  .listen(3000, "0.0.0.0", () => console.log(JSON.stringify({ event: "listening", port: 3000 })));
