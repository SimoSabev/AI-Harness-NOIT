import { describe, expect, it } from "vitest";
import { ResearchReport } from "@mandat/contract";
import { DEMO_PAGES, demoWorld } from "../demo.js";
import { esc, mdToHtml, reportHtml } from "./html.js";
import { reportMarkdown } from "./markdown.js";
import { processView } from "./process.js";
import { langOf } from "./text.js";

const hostile = {
  ...DEMO_PAGES,
  "https://evil.example.org/x": `<html><head><title>&lt;img src=x onerror=alert(1)&gt; "quoted"</title></head><body><article><p>${"The JSON Canonicalization Scheme sorts object properties by their UTF-16 code units. ".repeat(8)}</p></article></body></html>`,
};

describe("the downloadable report (D-397)", () => {
  it("HTML: self-contained, escaped, citations with the quote on hover, sources with hash, map and timeline, data as JSON", async () => {
    const r = await demoWorld({ pages: hostile }).run();
    const h = reportHtml(r);
    expect(h.startsWith("<!doctype html>")).toBe(true);
    expect(h).not.toMatch(/<script(?! type="application\/json")/);
    expect(h).not.toMatch(/(src|href)="(https?:)?\/\/(?!rfc-editor|ietf|blog\.example|evil\.example|mirror\.example)/);
    expect(h).not.toContain("<img src=x");
    expect(h).toMatch(/<a class="cite" href="#src-1" data-q="“[^"]*UTF-16[^"]*”/);
    for (const s of r.sources) expect(h).toContain(`id="src-${s.n}"`);
    expect(h).toContain('class="map"');
    expect(h).toContain('class="tl"');
    const data = /<script type="application\/json" id="report-data">([\s\S]*?)<\/script>/.exec(h)?.[1];
    expect(ResearchReport.parse(JSON.parse(data!)).id).toBe(r.id);
  });
  it("the words follow the question: Cyrillic → Bulgarian", () => {
    expect(langOf("auto", "Как JCS сортира ключовете?")).toBe("bg");
    expect(langOf("auto", "How?")).toBe("en");
    expect(langOf("en", "Как?")).toBe("en");
  });
  it("Markdown: answer, claims with their quotes, sources with URL and hash, models per role", async () => {
    const r = await demoWorld().run();
    const md = reportMarkdown(r);
    expect(md).toContain(`# ${r.request.question}`);
    expect(md).toContain("> “");
    for (const s of r.sources) expect(md).toContain(`](${s.final_url})`);
    expect(md).toMatch(/\| writing \| Demo model \| demo-1 \|/);
  });
  it("the process view counts per lane and per role", async () => {
    const r = await demoWorld().run();
    const v = processView(r.trace, r.plan.lanes);
    expect(v.lanes.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(v.lanes.reduce((a, l) => a + l.read, 0)).toBe(r.stats.pages_read);
    expect(v.roles.find((x) => x.role === "writer")?.calls).toBeGreaterThan(0);
    expect(v.tiers.http.ok).toBe(r.trace.filter((e) => e.kind === "fetch" && e.tier === "http" && e.status === "ok").length);
  });
  it("markdown to HTML: lists, headings, bold; HTML in the text is escaped; unknown citations vanish", () => {
    const out = mdToHtml("## Head\n- a **b** [1]\n- <b>x</b> [7]\n\npara", (n) => ({ title: `q${n}`, ok: n === 1 }));
    expect(out).toContain("<h4>Head</h4>");
    expect(out).toContain('<li>a <strong>b</strong> <a class="cite" href="#src-1" data-q="q1">1</a></li>');
    expect(out).toContain("<li>&lt;b&gt;x&lt;/b&gt; </li>");
    expect(esc(`"'<>&`)).toBe("&quot;&#39;&lt;&gt;&amp;");
  });
});
