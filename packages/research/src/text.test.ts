import { describe, expect, it } from "vitest";
import { Bm25, canonicalUrl, chunkText, domainOf, nearDuplicate, tokenize } from "./text.js";

describe("text helpers (E9г)", () => {
  it("canonical url: lower host, no fragment, no tracking params, no trailing slash, sorted query", () => {
    expect(canonicalUrl("HTTPS://WWW.Example.org/a/?utm_source=x&b=2&a=1#top")).toBe("https://example.org/a?a=1&b=2");
    expect(canonicalUrl("http://example.org/")).toBe("http://example.org/");
    expect(canonicalUrl("https://example.org/x?fbclid=1&gclid=2")).toBe("https://example.org/x");
    expect(canonicalUrl("not a url")).toBeNull();
    expect(canonicalUrl("ftp://example.org/x")).toBeNull();
  });
  it("domain without www", () => {
    expect(domainOf("https://www.rfc-editor.org/rfc/rfc8785")).toBe("rfc-editor.org");
    expect(domainOf("https://docs.python.org/3/")).toBe("docs.python.org");
  });
  it("tokenize: lower case, letters and digits of any script, short stop words out", () => {
    expect(tokenize("The JSON Canonicalization Scheme (RFC 8785)")).toEqual(["json", "canonicalization", "scheme", "rfc", "8785"]);
    expect(tokenize("Какво е ПЕС и как се плаща?")).toEqual(["какво", "пес", "как", "се", "плаща"]);
  });
  it("chunks keep their offset into the original text and overlap", () => {
    const text = "a ".repeat(500).trim();
    const chunks = chunkText(text, 200, 50);
    expect(chunks.length).toBeGreaterThan(4);
    for (const c of chunks) expect(text.slice(c.offset, c.offset + c.text.length)).toBe(c.text);
    expect(chunks[1]!.offset).toBeLessThan(chunks[0]!.offset + chunks[0]!.text.length);
  });
  it("chunks prefer a paragraph or sentence boundary", () => {
    const text = `${"First paragraph sentence. ".repeat(6)}\n\n${"Second one here. ".repeat(6)}`;
    const [first] = chunkText(text, 220, 0);
    expect(first!.text.endsWith(".")).toBe(true);
  });
  it("BM25 ranks the passage about the query first", () => {
    const bm = new Bm25(["the cat sat on the mat", "JSON canonicalization scheme RFC 8785 defines", "dogs and cats"]);
    const s = bm.scores("rfc 8785 canonicalization");
    expect(s.indexOf(Math.max(...s))).toBe(1);
    expect(s[0]).toBe(0);
  });
  it("near duplicates: the same article with a different footer", () => {
    const a = "The quick brown fox jumps over the lazy dog. ".repeat(20);
    expect(nearDuplicate(a + "Footer A", a + "Footer B")).toBe(true);
    expect(nearDuplicate(a, "Completely different text about canonical JSON and hashing. ".repeat(20))).toBe(false);
  });
});
