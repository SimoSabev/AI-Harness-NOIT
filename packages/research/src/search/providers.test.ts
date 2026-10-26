import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { anthropicWebSearch, arxiv, crossref, exa, github, searxng, stackexchange, webSearchToolType, wikipedia } from "./providers.js";
import type { SearchQuery, Transport } from "./providers.js";

const q = (o: Partial<SearchQuery> = {}): SearchQuery => ({ query: "json canonicalization", scope: "web", recency: "any", include: [], exclude: [], max: 5, language: "en", ...o });
function rec(text: string, status = 200) {
  const calls: { url: string; init: Parameters<Transport>[1] }[] = [];
  const t: Transport = async (url, init) => (calls.push({ url, init }), { status, text });
  return { t, calls };
}

describe("search providers with recorded answers (D-396)", () => {
  it("searxng: JSON results, site: operators, category by scope, time range", async () => {
    const r = rec(JSON.stringify({ results: [{ url: "https://a.org/x", title: "<b>JCS</b>", content: "the &quot;scheme&quot;", publishedDate: "2024-01-01" }] }));
    const hits = await searxng({ baseUrl: "http://127.0.0.1:8888/", transport: r.t }).search(q({ include: ["rfc-editor.org"], exclude: ["spam.example"], recency: "year", scope: "papers" }));
    expect(hits).toEqual([{ url: "https://a.org/x", title: "JCS", snippet: 'the "scheme"', date: "2024-01-01", provider: "searxng" }]);
    const u = new URL(r.calls[0]!.url);
    expect(u.searchParams.get("q")).toBe("json canonicalization site:rfc-editor.org -site:spam.example");
    expect(u.searchParams.get("categories")).toBe("science");
    expect(u.searchParams.get("time_range")).toBe("year");
  });
  it("searxng: all engines timed out → one more try", async () => {
    let n = 0;
    const t: Transport = async () => (n++ === 0 ? { status: 200, text: JSON.stringify({ results: [], unresponsive_engines: [["brave", "timeout"]] }) } : { status: 200, text: JSON.stringify({ results: [{ url: "https://a.org", title: "A", content: "" }] }) });
    expect(await searxng({ baseUrl: "http://127.0.0.1:8888", transport: t }).search(q())).toHaveLength(1);
    expect(n).toBe(2);
  });
  it("wikipedia: article URLs in the question's language", async () => {
    const r = rec(JSON.stringify({ query: { search: [{ title: "JSON Canonicalization", snippet: "<span>JCS</span> is", timestamp: "2025-02-03T00:00:00Z" }] } }));
    const [h] = await wikipedia({ transport: r.t }).search(q({ language: "bg" }));
    expect(h?.url).toBe("https://bg.wikipedia.org/wiki/JSON_Canonicalization");
    expect(h?.snippet).toBe("JCS is");
  });
  it("arxiv: Atom entries → abstract pages over https", async () => {
    const atom = `<feed><entry><id>http://arxiv.org/abs/2401.00001v1</id><published>2024-01-02T00:00:00Z</published><title>A  Paper</title><summary>We study.</summary></entry></feed>`;
    expect(await arxiv({ transport: rec(atom).t }).search(q({ scope: "papers" }))).toEqual([{ url: "https://arxiv.org/abs/2401.00001v1", title: "A Paper", snippet: "We study.", date: "2024-01-02", provider: "arxiv" }]);
  });
  it("crossref: DOI URL, title, date parts", async () => {
    const r = rec(JSON.stringify({ message: { items: [{ URL: "https://doi.org/10.1/x", title: ["T"], issued: { "date-parts": [[2020, 6, 1]] }, publisher: "P" }] } }));
    const [h] = await crossref({ mailto: "research@example.org", transport: r.t }).search(q({ scope: "papers" }));
    expect(h).toMatchObject({ url: "https://doi.org/10.1/x", title: "T", date: "2020-06-01", snippet: "P" });
    expect(r.calls[0]!.url).toContain("mailto=research%40example.org");
  });
  it("github and stackexchange", async () => {
    const g = await github({ transport: rec(JSON.stringify({ items: [{ html_url: "https://github.com/a/b", full_name: "a/b", description: "lib", stargazers_count: 5, pushed_at: "2026-01-01T00:00:00Z" }] })).t }).search(q({ scope: "code" }));
    expect(g[0]).toMatchObject({ url: "https://github.com/a/b", snippet: "lib ★5", date: "2026-01-01" });
    const s = await stackexchange({ transport: rec(JSON.stringify({ items: [{ link: "https://stackoverflow.com/q/1", title: "How &amp; why", score: 3, is_answered: true, last_activity_date: 1700000000 }] })).t }).search(q({ scope: "code" }));
    expect(s[0]).toMatchObject({ title: "How & why", snippet: "score 3 · answered" });
  });
  it("exa through the proxy: the mdt_ token, highlights as the snippet, domains and dates", async () => {
    const r = rec(JSON.stringify({ results: [{ url: "https://a.org/x", title: "A", highlights: ["one", "two"], publishedDate: "2025-05-05T00:00:00.000Z" }] }));
    const [h] = await exa({ transport: r.t, baseUrl: "http://proxy/research/exa", token: "mdt_x" }).search(q({ include: ["a.org"], recency: "month" }));
    expect(h).toMatchObject({ snippet: "one … two", date: "2025-05-05", provider: "exa" });
    const body = r.calls[0]!.init?.body as Record<string, unknown>;
    expect(body.includeDomains).toEqual(["a.org"]);
    expect(typeof body.startPublishedDate).toBe("string");
    expect(r.calls[0]!.init?.headers?.authorization).toBe("Bearer mdt_x");
  });
  it("an error status is an error without the body", async () => {
    await expect(wikipedia({ transport: rec("secret echo", 500).t }).search(q())).rejects.toThrow(/answered 500$/);
  });
  it("anthropic web search: the tool version by model; results from the tool block; an error block gives no hits", async () => {
    expect(webSearchToolType("claude-haiku-5-5")).toBe("web_search_20250305");
    expect(webSearchToolType("claude-sonnet-5-5")).toBe("web_search_20260209");
    const answers = [
      { content: [{ type: "server_tool_use", id: "s", name: "web_search", input: {} }, { type: "web_search_tool_result", tool_use_id: "s", content: [{ type: "web_search_result", url: "https://a.org/1", title: "One", page_age: "2025-01-01", encrypted_content: "x" }] }] },
      { content: [{ type: "web_search_tool_result", tool_use_id: "s", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } }] },
    ];
    let i = 0;
    const sent: unknown[] = [];
    const client = { messages: { create: async (body: unknown) => (sent.push(body), { ...answers[i++], stop_reason: "end_turn" }) } } as unknown as Anthropic;
    const p = anthropicWebSearch({ client, model: "claude-haiku-5-5" });
    expect(await p.search(q({ exclude: ["spam.example"] }))).toEqual([{ url: "https://a.org/1", title: "One", snippet: "", date: "2025-01-01", provider: "anthropic-web-search" }]);
    expect(JSON.stringify(sent[0])).toContain('"blocked_domains":["spam.example"]');
    expect(await p.search(q())).toEqual([]);
  });
});
