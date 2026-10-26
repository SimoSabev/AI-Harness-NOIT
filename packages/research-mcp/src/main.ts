#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { Fetcher, arxiv, github, searxng, stackexchange, wikipedia } from "@mandat/research";
import type { SearchProvider } from "@mandat/research";
import { DEFAULT_SEARXNG, openDb } from "@mandat/worker";
import { ResearchBackend } from "./backend.js";
import { dbQueue } from "./queue.js";

// E9г (D-412): `mandat-research-mcp` over stdio — for an agent on this computer (`claude mcp add research -- node
// packages/research-mcp/dist/main.js`). Own search always; research_ask/recall when MANDAT_DB_URL points at the harness
// database (pnpm local). stdout is JSON-RPC only; logs go to stderr.
const env = process.env;
const sx = env.MANDAT_SEARXNG_URL ?? DEFAULT_SEARXNG;
const providers: SearchProvider[] = [wikipedia(), arxiv(), github(), stackexchange()];
const up = await fetch(`${sx}/healthz`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);
if (up) providers.unshift(searxng({ baseUrl: sx }));
else process.stderr.write(`research-mcp: SearXNG is not running at ${sx} (pnpm mandat research engine start); using the open APIs only\n`);
let queue = null;
if (env.MANDAT_DB_URL) {
  const db = openDb(env.MANDAT_DB_URL);
  const org = env.MANDAT_RESEARCH_ORG ?? (await db.query<{ id: string }>("select id::text as id from public.orgs order by created_at limit 1")).rows[0]?.id;
  if (org) queue = dbQueue(db, org);
}
const backend = new ResearchBackend({ providers, fetcher: new Fetcher({ respectRobots: true }), queue });
const { createResearchServer } = await import("./server.js");
serveStdio(() => createResearchServer(backend), { onerror: (e) => process.stderr.write(`research-mcp: ${e.message}\n`) });
