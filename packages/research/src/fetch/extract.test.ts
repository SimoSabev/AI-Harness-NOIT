import { describe, expect, it } from "vitest";
import { extractHtml, extractText } from "./extract.js";

const article = `<!doctype html><html lang="en"><head><title>JCS explained | Example Docs</title>
<meta property="article:published_time" content="2024-05-02T10:00:00Z"><meta property="og:site_name" content="Example Docs">
<link rel="canonical" href="/docs/jcs"><script>var tracking = 1;</script></head><body>
<nav><a href="/">Home</a><a href="/pricing">Pricing</a></nav>
<article><h1>JSON Canonicalization Scheme</h1>
<p>The JSON Canonicalization Scheme (JCS) is defined in RFC 8785. It produces a canonical form of JSON data so that it can be hashed and signed reliably across implementations.</p>
<p>Properties are sorted by their UTF-16 code units. Numbers are serialized the way ECMAScript does it, which avoids ambiguity between implementations in different languages.</p>
<ul><li>Whitespace is removed.</li><li>Strings use the shortest escape.</li></ul>
<p>See <a href="https://www.rfc-editor.org/rfc/rfc8785">the RFC</a> for details.</p></article>
<footer>© Example</footer></body></html>`;

describe("extracting the main text of a page", () => {
  it("article text with headings and list items; no navigation, scripts or footer", () => {
    const e = extractHtml(article, "https://docs.example.org/jcs?x=1");
    expect(e.text).toContain("defined in RFC 8785");
    expect(e.text).toContain("- Whitespace is removed.");
    expect(e.text).not.toContain("Pricing");
    expect(e.text).not.toContain("tracking");
    expect(e.published).toBe("2024-05-02");
    expect(e.site).toBe("Example Docs");
    expect(e.canonical).toBe("https://docs.example.org/docs/jcs");
    expect(e.lang).toBe("en");
    expect(e.links.map((l) => l.url)).toContain("https://www.rfc-editor.org/rfc/rfc8785");
    expect(e.needsBrowser).toBe(false);
    expect(e.wall).toBe(false);
  });
  it("an empty app shell with scripts → needs a browser", () => {
    const shell = `<html><head><title>App</title>${"<script src='/a.js'></script>".repeat(6)}</head><body><div id="root"></div></body></html>`;
    expect(extractHtml(shell, "https://app.example.org/").needsBrowser).toBe(true);
  });
  it("a bot wall is recognized and is not mistaken for content", () => {
    const wall = `<html><head><title>Just a moment...</title></head><body><div id="cf-chl-widget">Checking your browser</div></body></html>`;
    const e = extractHtml(wall, "https://x.example.org/");
    expect(e.wall).toBe(true);
    expect(e.needsBrowser).toBe(false);
  });
  it("javascript: and mailto: links are dropped; relative links become absolute", () => {
    const e = extractHtml(`<html><body><a href="javascript:x()">x</a><a href="mailto:a@b.c">m</a><a href="../up">up</a></body></html>`, "https://a.org/b/c");
    expect(e.links.map((l) => l.url)).toEqual(["https://a.org/up"]);
  });
  it("plain text: the first heading is the title", () => {
    expect(extractText("\n# Title here\nbody").title).toBe("Title here");
  });
});
