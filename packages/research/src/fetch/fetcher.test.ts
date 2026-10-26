import { describe, expect, it } from "vitest";
import { Fetcher } from "./fetcher.js";
import type { Attempt } from "./fetcher.js";
import type { HttpResult } from "./http.js";

const long = `<html><head><title>Real page</title></head><body><article><p>${"Useful sentence about the topic that is long enough. ".repeat(20)}</p></article></body></html>`;
const res = (url: string, status: number, body: string, contentType = "text/html"): HttpResult => ({ url, finalUrl: url, status, contentType, body: Buffer.from(body), ms: 5, truncated: false });

function fakeGet(pages: Record<string, [number, string, string?]>) {
  const calls: string[] = [];
  return {
    calls,
    get: async (url: string) => {
      calls.push(url);
      const p = pages[url];
      if (!p) return res(url, 404, "");
      return res(url, p[0], p[1], p[2] ?? "text/html");
    },
  };
}
const quick = { sleep: async () => {}, politeMs: 0 };

describe("the fetch ladder (D-405)", () => {
  it("http is enough for a normal page; one attempt, ok", async () => {
    const g = fakeGet({ "https://a.org/x": [200, long] });
    const at: Attempt[] = [];
    const p = await new Fetcher({ get: g.get, ...quick }).fetch("https://a.org/x", (a) => at.push(a));
    expect(p?.tier).toBe("http");
    expect(p?.contentHash).toMatch(/^sha256:/);
    expect(at.map((a) => [a.tier, a.status])).toEqual([["http", "ok"]]);
  });
  it("robots.txt disallows → no request to the page", async () => {
    const g = fakeGet({ "https://a.org/robots.txt": [200, "User-agent: *\nDisallow: /x", "text/plain"], "https://a.org/x": [200, long] });
    const at: Attempt[] = [];
    expect(await new Fetcher({ get: g.get, ...quick }).fetch("https://a.org/x", (a) => at.push(a))).toBeNull();
    expect(at[0]?.status).toBe("robots");
    expect(g.calls).not.toContain("https://a.org/x");
    // the request can turn robots off
    expect(await new Fetcher({ get: g.get, ...quick, respectRobots: false }).fetch("https://a.org/x", () => {})).not.toBeNull();
  });
  it("a JS app shell goes to the browser", async () => {
    const shell = `<html><head>${"<script src=a.js></script>".repeat(6)}</head><body><div id="root"></div></body></html>`;
    const g = fakeGet({ "https://app.org/p": [200, shell] });
    const at: Attempt[] = [];
    const p = await new Fetcher({ get: g.get, ...quick, renderer: { render: async (u) => ({ finalUrl: u, status: 200, html: long }) } }).fetch("https://app.org/p", (a) => at.push(a));
    expect(p?.tier).toBe("browser");
    expect(at.map((a) => [a.tier, a.status])).toEqual([["http", "thin"], ["browser", "ok"]]);
  });
  it("a bot wall is not given to the browser: the archived copy is read instead", async () => {
    const wall = "<html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>";
    const g = fakeGet({
      "https://shop.org/a": [403, wall],
      [`https://archive.org/wayback/available?url=${encodeURIComponent("https://shop.org/a")}`]: [200, JSON.stringify({ archived_snapshots: { closest: { available: true, url: "x", timestamp: "20260101000000" } } }), "application/json"],
      "https://web.archive.org/web/20260101000000id_/https://shop.org/a": [200, long],
    });
    let rendered = 0;
    const at: Attempt[] = [];
    const p = await new Fetcher({ get: g.get, ...quick, renderer: { render: async () => (rendered++, { finalUrl: "", status: 200, html: long }) } }).fetch("https://shop.org/a", (a) => at.push(a));
    expect(rendered).toBe(0);
    expect(p?.tier).toBe("archive");
    expect(p?.finalUrl).toBe("https://web.archive.org/web/20260101000000id_/https://shop.org/a");
    expect(at.map((a) => [a.tier, a.status])).toEqual([["http", "blocked"], ["archive", "ok"]]);
  });
  it("no copy → an extract provider; nothing works → null with every attempt reported", async () => {
    const g = fakeGet({ "https://x.org/a": [500, "err"] });
    const at: Attempt[] = [];
    const p = await new Fetcher({ get: g.get, ...quick, extractors: [{ name: "exa", extract: async () => ({ finalUrl: "https://x.org/a", title: "T", text: "y".repeat(400), published: "2025-01-01" }) }] }).fetch("https://x.org/a", (a) => at.push(a));
    expect(p?.tier).toBe("provider");
    expect(p?.published).toBe("2025-01-01");
    const none = await new Fetcher({ get: g.get, ...quick }).fetch("https://x.org/a", () => {});
    expect(none).toBeNull();
  });
  it("a refused URL (SSRF) stops the ladder at once", async () => {
    const at: Attempt[] = [];
    const p = await new Fetcher({ ...quick, respectRobots: false }).fetch("http://169.254.169.254/latest", (a) => at.push(a));
    expect(p).toBeNull();
    expect(at.map((a) => a.status)).toEqual(["skipped"]);
  });
  it("politeness: a pause between two requests to the same site", async () => {
    const g = fakeGet({ "https://a.org/1": [200, long], "https://a.org/2": [200, long] });
    const waits: number[] = [];
    const f = new Fetcher({ get: g.get, politeMs: 400, respectRobots: false, sleep: async (ms) => void waits.push(ms), now: () => 1000 });
    await f.fetch("https://a.org/1", () => {});
    await f.fetch("https://a.org/2", () => {});
    expect(waits).toEqual([400]);
  });
});
