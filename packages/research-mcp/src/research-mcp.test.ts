import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RESEARCH_TOOLS } from "@mandat/contract";
import { DEMO_PAGES, demoEnv, Fetcher } from "@mandat/research";
import type { HttpResult, SearchProvider } from "@mandat/research";
import { pgliteDb } from "../../../apps/worker/src/online/pglite-db.test-helper.js";
import { DEMO_ORG_ID, seedMinimal } from "../../../apps/worker/src/online/seed.js";
import { runResearchOnce } from "../../../apps/worker/src/online/research.js";
import { ResearchBackend } from "./backend.js";
import { dbQueue } from "./queue.js";

const main = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/main.js");
const res = (url: string): HttpResult => ({ url, finalUrl: url, status: DEMO_PAGES[url] ? 200 : 404, contentType: "text/html", body: Buffer.from(DEMO_PAGES[url] ?? ""), ms: 1, truncated: false });
const fetcher = () => new Fetcher({ get: async (u) => res(u), respectRobots: false, archive: false, politeMs: 0, sleep: async () => {} });
const provider: SearchProvider = { name: "fake", scopes: ["web", "docs", "code", "papers"], usdPerQuery: 0, search: async () => Object.keys(DEMO_PAGES).map((url) => ({ url, title: url, snippet: "JCS UTF-16", date: null, provider: "fake" })) };

describe("the research MCP server (D-412)", () => {
  it("AC-13.1: an agent sees the seven research_* tools", async () => {
    const t = new StdioClientTransport({ command: "node", args: [main], env: { PATH: process.env.PATH ?? "", MANDAT_SEARXNG_URL: "http://127.0.0.1:9" } });
    const c = new Client({ name: "t", version: "1" });
    await c.connect(t);
    const names = (await c.listTools()).tools.map((x) => x.name).sort();
    expect(names).toEqual([...RESEARCH_TOOLS].sort());
    const r = (await c.callTool({ name: "research_read", arguments: { url: "https://made-up.example.org/fact" } })) as { content: { text: string }[]; isError?: boolean };
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0]?.text ?? "{}").error).toMatch(/did not come from a research tool result/);
    await c.close();
  }, 60_000);
});

describe("the research backend (D-412)", () => {
  it("search gives source ids; read accepts only those, frames the text, gives hash and final URL", async () => {
    const b = new ResearchBackend({ providers: [provider], fetcher: fetcher(), queue: null });
    const hits = await b.search({ query: "JCS sort", scope: "web", recency: "any", max: 5 });
    expect(hits.length).toBeGreaterThan(2);
    expect(hits[0]?.source_id).toMatch(/^src_[0-9a-f]{12}$/);
    const page = await b.read({ source_id: hits.find((h) => h.url.includes("rfc-editor"))!.source_id, question: "sort" });
    expect(page.text).toMatch(/^<untrusted author="rfc-editor.org"/);
    expect(page.content_hash).toMatch(/^sha256:/);
    expect((await b.read({ url: "https://evil.example.org/" })).error).toMatch(/did not come from/);
    expect((await b.read({ source_id: "src_000000000000" })).error).toMatch(/unknown source_id/);
  });
  it("AC-13.5: verify — a quote in two sites → confirmed; in one → single; not in the source → quote_missing; no quote → unchecked", async () => {
    const b = new ResearchBackend({ providers: [provider], fetcher: fetcher(), queue: null });
    const hits = await b.search({ query: "JCS", scope: "web", recency: "any", max: 6 });
    const id = (part: string) => hits.find((h) => h.url.includes(part))!.source_id;
    const [two, one, missing, none] = await b.verify({
      claims: [
        { text: "published in June 2020", source_ids: [id("rfc-editor"), id("ietf")], urls: [], quote: "published in June 2020" },
        { text: "sorted by UTF-16", source_ids: [id("ietf")], urls: [], quote: "sorted by UTF-16 code units, not by UTF-8 bytes" },
        { text: "JCS uses UTF-32", source_ids: [id("rfc-editor")], urls: [], quote: "sorted by UTF-32 code points" },
        { text: "no quote", source_ids: [id("rfc-editor")], urls: ["https://unknown.example.org/"] },
      ],
    });
    expect(two?.verdict).toBe("confirmed");
    expect(one?.verdict).toBe("single");
    expect(missing?.verdict).toBe("quote_missing");
    expect(none?.verdict).toBe("unchecked");
    expect(none?.note).toMatch(/refused/);
  });
  describe("ask and recall through the queue (AC-13.9)", () => {
    let db: Awaited<ReturnType<typeof pgliteDb>>;
    beforeAll(async () => {
      db = await pgliteDb();
      await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
    }, 120_000);
    afterAll(() => db.end());
    it("ask queues a run as the agent, waits, returns the checked answer; recall finds it later without a new search", async () => {
      let t = 0;
      const b = new ResearchBackend({ providers: [provider], fetcher: fetcher(), queue: dbQueue(db, DEMO_ORG_ID), askWaitMs: 60_000, now: () => t, sleep: async (ms) => { t += ms; await runResearchOnce({ db, envFor: async () => demoEnv(), stopPollMs: 50 }); } });
      const r = await b.ask({ question: "How does JCS sort keys?", depth: "standard" });
      expect(r.status).toBe("done");
      expect((r.claims as unknown[]).length).toBeGreaterThan(0);
      expect((await db.query<{ requested_by: string }>("select requested_by from public.research_questions where id = $1", [r.job_id])).rows[0]?.requested_by).toBe("agent");
      const again = await b.recall({ question: "how does JCS sort the keys", repo: "any" });
      expect((again.results as { job_id: string }[])[0]?.job_id).toBe(r.job_id);
      expect((await b.recall({ question: "weather in Sofia", repo: "any" })).results).toEqual([]);
    }, 120_000);
    it("without the harness database ask and recall say what is missing", async () => {
      const b = new ResearchBackend({ providers: [provider], fetcher: fetcher(), queue: null });
      expect((await b.ask({ question: "q", depth: "quick" })).error).toMatch(/worker/);
    });
  });
});
