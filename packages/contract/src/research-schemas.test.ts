import { describe, expect, it } from "vitest";
import { Claim, Quote, RESEARCH_TOOLS, ResearchResult, ResearchToolInput, SourceRecord } from "./index.js";

const src = {
  id: "src_1",
  provider: "anthropic-web-search",
  url: "https://docs.example.com/a",
  final_url: "https://docs.example.com/a",
  title: "A",
  content_hash: `sha256:${"a".repeat(64)}`,
  fetched_at: "2026-10-22T10:00:00.000Z",
  archived_url: null,
  archive_digest: null,
  state: "read",
};

describe("research schemas (v5 2.5, D-324)", () => {
  it("a source record has a hash, the final url and a state", () => {
    expect(SourceRecord.parse(src).state).toBe("read");
    expect(() => SourceRecord.parse({ ...src, url: "file:///etc/passwd" })).toThrow();
    expect(() => SourceRecord.parse({ ...src, content_hash: "md5:1" })).toThrow();
  });
  it("a quote is an offset + length into the source text, length matches the text", () => {
    expect(Quote.parse({ source_id: "src_1", offset: 10, length: 3, text: "abc" }).length).toBe(3);
    expect(() => Quote.parse({ source_id: "src_1", offset: 10, length: 4, text: "abc" })).toThrow();
  });
  it("claims: five verdicts; confirmed needs a quote", () => {
    expect(Claim.parse({ text: "x", verdict: "quote_missing", quote_ids: [], as_of: null }).verdict).toBe("quote_missing");
    expect(() => Claim.parse({ text: "x", verdict: "confirmed", quote_ids: [], as_of: null })).toThrow();
    expect(() => Claim.parse({ text: "x", verdict: "maybe", quote_ids: [], as_of: null })).toThrow();
  });
  it("seven research tools with input schemas", () => {
    expect([...RESEARCH_TOOLS].sort()).toEqual(["research_ask", "research_code", "research_docs", "research_read", "research_recall", "research_search", "research_verify"]);
    expect(ResearchToolInput.research_search.parse({ query: "q", scope: "docs" })).toMatchObject({ scope: "docs" });
    expect(() => ResearchToolInput.research_ask.parse({ question: "q", depth: "infinite" })).toThrow();
    expect(() => ResearchToolInput.research_read.parse({})).toThrow();
  });
  it("a result carries cost and unresolved questions", () => {
    const r = ResearchResult.parse({ question: "q", depth: "standard", claims: [], synthesis: "", unresolved: ["why"], cost_usd: 0.12, partial: null });
    expect(r.unresolved).toEqual(["why"]);
  });
});
