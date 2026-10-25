import http from "node:http";
import { Readable } from "node:stream";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Server, createMcpHandler } from "@modelcontextprotocol/server";
import type { Sha256 } from "@mandat/contract";
import { toolDefHashes, vetServer } from "./vet.js";
import type { Finding, ToolDef } from "./vet.js";

// E8e (v5 p. 4.5 (4), D-354): the sidecar's bridge. One long-lived stdio client to the MCP server; every HTTP request
// gets a fresh low-level Server that forwards tools/list and tools/call (streamable HTTP, stateless, 2025 era by default).
// It vets the definitions before serving anything and blocks for good on a changed hash or tools/list_changed.
export type BridgeState = "serving" | "blocked";
export interface BridgeStatus { state: BridgeState; reason: "findings" | "changed" | "list_changed" | "upstream_down" | null; hash: Sha256; findings: Finding[]; tools: number }
export interface Bridge { port: number; status(): BridgeStatus; definitions(): ReturnType<typeof toolDefHashes>; close(): Promise<void> }
export interface BridgeOptions {
  command: string;
  args: string[];
  /** the server's own env (its secrets go here and only here) */
  env: Record<string, string>;
  cwd?: string;
  port: number;
  host: string;
  /** the hash approved in the catalog; null on the first vetting */
  approvedHash: Sha256 | null;
  enabledTools: string[] | null;
  onEvent?: (e: { kind: "blocked"; reason: string; hash: Sha256 }) => void;
}

export async function startBridge(o: BridgeOptions): Promise<Bridge> {
  const upstream = new Client({ name: "mandat-mcp-bridge", version: "0.1.0" });
  await upstream.connect(new StdioClientTransport({ command: o.command, args: o.args, env: o.env, ...(o.cwd ? { cwd: o.cwd } : {}), stderr: "ignore" }));
  const first = (await upstream.listTools()).tools as ToolDef[];
  const v = vetServer(first, o.approvedHash);
  let status: BridgeStatus = { state: v.ok ? "serving" : "blocked", reason: v.ok ? null : v.findings.length > 0 ? "findings" : "changed", hash: v.hash, findings: v.findings, tools: first.length };
  const block = (reason: NonNullable<BridgeStatus["reason"]>, hash: Sha256) => {
    if (status.state === "blocked") return;
    status = { ...status, state: "blocked", reason, hash };
    o.onEvent?.({ kind: "blocked", reason, hash });
  };
  // a rug pull: definitions that change after approval are never served (re-approval in the catalog)
  upstream.setNotificationHandler("notifications/tools/list_changed", async () => {
    const now = (await upstream.listTools().catch(() => ({ tools: [] }))).tools as ToolDef[];
    block("list_changed", vetServer(now, null).hash);
  });
  let closing = false;
  upstream.onclose = () => {
    if (!closing) block("upstream_down", status.hash);
  };

  const allowed = (name: string) => o.enabledTools === null || o.enabledTools.includes(name);
  const factory = () => {
    const s = new Server({ name: "mandat-mcp-bridge", version: "0.1.0" }, { capabilities: { tools: {} } });
    s.setRequestHandler("tools/list", async () => {
      const r = await upstream.listTools();
      return { tools: r.tools.filter((t) => allowed(t.name)) };
    });
    s.setRequestHandler("tools/call", async (req, ctx) => {
      if (status.state !== "serving") throw new Error("mandat: this MCP server is blocked");
      if (!allowed(req.params.name)) throw new Error(`mandat: tool ${req.params.name} is not enabled`);
      return upstream.callTool({ name: req.params.name, arguments: req.params.arguments ?? {} }, { signal: ctx.mcpReq.signal, timeout: 120_000 });
    });
    return s;
  };
  const handler = createMcpHandler(factory, { onerror: () => undefined });

  const server = http.createServer((req, res) => void serve(req, res));
  async function serve(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const p = new URL(req.url ?? "/", "http://bridge").pathname;
    if (p === "/status") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(status));
      return;
    }
    if (p !== "/mcp") {
      res.writeHead(404).end();
      return;
    }
    if (status.state !== "serving") {
      res.writeHead(503, { "content-type": "application/json" }).end(JSON.stringify({ error: "mandat_mcp_blocked", reason: status.reason }));
      return;
    }
    const ac = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) ac.abort();
    });
    const headers = new Headers();
    for (const [k, val] of Object.entries(req.headers)) if (val !== undefined) headers.set(k, Array.isArray(val) ? val.join(", ") : val);
    const body = req.method !== "GET" && req.method !== "HEAD";
    const request = new Request(`http://bridge${req.url ?? "/mcp"}`, { method: req.method ?? "POST", headers, signal: ac.signal, ...(body ? { body: Readable.toWeb(req) as ReadableStream, duplex: "half" } : {}) } as RequestInit);
    try {
      const response = await handler.fetch(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.flushHeaders();
      if (response.body) for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) res.write(chunk);
      res.end();
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  }
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(o.port, o.host, () => resolve());
  });
  const addr = server.address();
  return {
    port: typeof addr === "object" && addr ? addr.port : o.port,
    status: () => status,
    definitions: () => toolDefHashes(first),
    async close() {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      await handler.close().catch(() => undefined);
      closing = true;
      await upstream.close().catch(() => undefined);
    },
  };
}
