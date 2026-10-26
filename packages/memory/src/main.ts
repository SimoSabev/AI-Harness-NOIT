#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import pg from "pg";
import { createMemoryServer } from "./mcp.js";
import { parseMemoryArgs, resolveMemoryScope } from "./mcp-args.js";

// D-394: the memory MCP server for a person's own agent sessions. stdout is JSON-RPC only; logs go to stderr.
const p = parseMemoryArgs(process.argv.slice(2), process.env);
if (!p.ok) {
  process.stderr.write(`mandat-memory-mcp: ${p.error}\n`);
  process.exit(2);
}
const pool = new pg.Pool({ connectionString: p.args.dbUrl, max: 2, connectionTimeoutMillis: 5000 });
const sql = { query: async <T>(text: string, params?: unknown[]) => ({ rows: (await pool.query(text, params)).rows as T[] }) };
const scope = await resolveMemoryScope(sql, p.args).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? `database: ${e.message.slice(0, 200)}` : "database error" }));
if (!scope.ok) {
  process.stderr.write(`mandat-memory-mcp: ${scope.error}\n`);
  await pool.end();
  process.exit(2);
}
const server = await createMemoryServer({ sql, org: scope.org, user: scope.user, repo: scope.repo, session: randomUUID() });
serveStdio(() => server, { onerror: (e) => process.stderr.write(`mandat-memory-mcp: ${e.message}\n`) });
