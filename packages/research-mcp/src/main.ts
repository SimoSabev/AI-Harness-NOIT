#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import pg from "pg";
import { Fetcher, arxiv, github, searxng, stackexchange, wikipedia } from "@mandat/research";
import type { SearchProvider } from "@mandat/research";
import { providersFromArgs } from "./args.js";
import type { ProviderName } from "./args.js";
import { ResearchBackend } from "./backend.js";
import { dbQueue } from "./queue.js";

// E9г (D-412): `mandat-research-mcp` over stdio — for an agent on this computer (`claude mcp add research -- node
// packages/research-mcp/dist/main.js`) and, behind the E8д bridge, in the research sidecar of a sandbox run (D-441).
// Own search always; research_ask/recall when MANDAT_DB_URL points at the harness database (pnpm local).
// stdout is JSON-RPC only; logs go to stderr.
const env = process.env;
const o = providersFromArgs(process.argv.slice(2), env);
const want = (n: ProviderName) => o.only === undefined || o.only.includes(n);
const providers: SearchProvider[] = [
  ...(want("wikipedia") ? [wikipedia()] : []), ...(want("arxiv") ? [arxiv()] : []), ...(want("github") ? [github()] : []), ...(want("stackexchange") ? [stackexchange()] : []),
];
if (want("searxng")) {
  const up = await fetch(`${o.searxngUrl}/healthz`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);
  if (up) providers.unshift(searxng({ baseUrl: o.searxngUrl }));
  else process.stderr.write(`research-mcp: SearXNG is not running at ${o.searxngUrl} (pnpm mandat research engine start); using the open APIs only\n`);
}
let queue = null;
if (env.MANDAT_DB_URL) {
  const pool = new pg.Pool({ connectionString: env.MANDAT_DB_URL, max: 2, connectionTimeoutMillis: 5000 });
  const db = { query: async <T>(text: string, params?: unknown[]) => ({ rows: (await pool.query(text, params)).rows as T[] }) };
  const org = env.MANDAT_RESEARCH_ORG ?? (await db.query<{ id: string }>("select id::text as id from public.orgs order by created_at limit 1")).rows[0]?.id;
  if (org) queue = dbQueue(db, org);
}
const backend = new ResearchBackend({ providers, fetcher: new Fetcher({ respectRobots: true }), queue });
const { createResearchServer } = await import("./server.js");
serveStdio(() => createResearchServer(backend), { onerror: (e) => process.stderr.write(`research-mcp: ${e.message}\n`) });
