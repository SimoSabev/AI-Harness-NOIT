import { describe, expect, it } from "vitest";
import { fuseHits } from "./rank.js";
import type { Hit } from "./rank.js";

const h = (url: string, provider: string, title = "x", snippet = ""): Hit => ({ url, title, snippet, date: null, provider });

describe("fusing hits of several providers (PRD 6.13 step 2)", () => {
  it("one URL from two providers counts once, ranks higher and keeps both providers", () => {
    const r = fuseHits([[h("https://a.org/1", "searxng"), h("https://b.org/1", "searxng")], [h("https://www.b.org/1/#x", "exa")]], { question: "x" });
    expect(r[0]?.canonical).toBe("https://b.org/1");
    expect(r[0]?.providers).toEqual(["searxng", "exa"]);
    expect(r).toHaveLength(2);
  });
  it("the text match lifts an on-topic page over an off-topic first hit", () => {
    const r = fuseHits([[h("https://spam.example/1", "p", "Best deals", "buy now"), h("https://rfc-editor.org/rfc/rfc8785", "p", "RFC 8785 JSON Canonicalization Scheme", "JCS")]], { question: "RFC 8785 JSON canonicalization" });
    expect(r[0]?.domain).toBe("rfc-editor.org");
  });
  it("excluded and already seen pages are out; include keeps only its domains and their subdomains", () => {
    const lists = [[h("https://seo.farm/a", "p"), h("https://docs.python.org/a", "p"), h("https://x.org/seen", "p")]];
    const r = fuseHits(lists, { question: "x", exclude: ["seo.farm"], seen: new Set(["https://x.org/seen"]) });
    expect(r.map((x) => x.domain)).toEqual(["docs.python.org"]);
    expect(fuseHits(lists, { question: "x", include: ["python.org"] }).map((x) => x.domain)).toEqual(["docs.python.org"]);
  });
  it("at most two pages per site, then a limit", () => {
    const list = [1, 2, 3, 4].map((i) => h(`https://same.org/${i}`, "p")).concat([h("https://other.org/1", "p")]);
    const r = fuseHits([list], { question: "x" });
    expect(r.map((x) => x.domain)).toEqual(["same.org", "same.org", "other.org"]);
    expect(fuseHits([list], { question: "x", limit: 1 })).toHaveLength(1);
  });
  it("bad URLs are dropped", () => {
    expect(fuseHits([[h("javascript:alert(1)", "p"), h("not a url", "p")]], { question: "x" })).toEqual([]);
  });
});
