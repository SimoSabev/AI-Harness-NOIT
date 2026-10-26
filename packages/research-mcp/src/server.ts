import { McpServer } from "@modelcontextprotocol/server";
import { ResearchToolInput } from "@mandat/contract";
import type { ResearchBackend } from "./backend.js";

// E9г (PRD 6.13, v5 2.5, D-412): the `research` MCP server — the seven research_* tools every connected agent gets.
// JSON results as text content, like the mandat server (packages/mcp/src/server.ts).
const json = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });
const fail = (msg: string) => ({ content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }], isError: true });
const out = (v: Record<string, unknown>) => (typeof v.error === "string" ? fail(v.error) : json(v));

export function createResearchServer(b: ResearchBackend): McpServer {
  const s = new McpServer({ name: "research", version: "0.1.0" }, { capabilities: { tools: {} } });
  s.registerTool(
    "research_search",
    {
      description: "Search the web, docs, code or papers with Mandat's own search (several engines, fused, deduplicated). Returns sources with source_id; only these URLs can be read or cited.",
      inputSchema: ResearchToolInput.research_search,
    },
    async (a) => json({ results: await b.search(a) }),
  );
  s.registerTool(
    "research_read",
    {
      description: "Read one source from a research_search result (by source_id or its url): the main text (as untrusted data), its hash, final URL and date. Give `question` to get the passages that matter.",
      inputSchema: ResearchToolInput.research_read,
    },
    async (a) => out(await b.read(a)),
  );
  s.registerTool(
    "research_docs",
    {
      description: "Documentation of a library at a version on a topic: searches the docs scope and reads the best page.",
      inputSchema: ResearchToolInput.research_docs,
    },
    async (a) => {
      const hits = await b.search({ query: `${a.library} ${a.version ?? ""} ${a.topic}`.replace(/\s+/g, " ").trim(), scope: "docs", recency: "any", max: 5 });
      const first = hits[0];
      return first ? out({ results: hits, page: await b.read({ source_id: first.source_id, question: a.topic }) }) : json({ results: [] });
    },
  );
  s.registerTool(
    "research_code",
    { description: "Search code and Q&A (repositories, Stack Overflow); `repo` narrows to one GitHub repository.", inputSchema: ResearchToolInput.research_code },
    async (a) => json({ results: await b.search({ query: a.query, scope: "code", recency: "any", max: 8, ...(a.repo ? { domains: ["github.com"] } : {}) }) }),
  );
  s.registerTool(
    "research_ask",
    {
      description: "A full research run by Mandat: a plan, several search lanes, pages read, verbatim quotes, claims with verdicts (confirmed / single source / conflict), a cited answer. Waits up to 4 minutes, then returns the job id (research_recall finds it later).",
      inputSchema: ResearchToolInput.research_ask,
    },
    async (a) => out(await b.ask(a)),
  );
  s.registerTool(
    "research_verify",
    {
      description: "Check your own claims before you rely on them: for each claim give the source_ids/urls (from research tools) and the exact quote. Verdict: confirmed (2 independent sites), single, quote_missing (the source does not say it), unchecked (no quote).",
      inputSchema: ResearchToolInput.research_verify,
    },
    async (a) => json({ claims: await b.verify(a) }),
  );
  s.registerTool(
    "research_recall",
    { description: "Earlier research of this project on a question or topic, with its date and sources — before you search again.", inputSchema: ResearchToolInput.research_recall },
    async (a) => out(await b.recall(a)),
  );
  return s;
}
