import { sha256Tag } from "@mandat/contract";
import type { FetchStatus, FetchTier, Sha256 } from "@mandat/contract";
import { domainOf } from "../text.js";
import { extractHtml, extractPdf, extractText } from "./extract.js";
import type { Extracted } from "./extract.js";
import { ROBOTS_AGENT, httpGet } from "./http.js";
import type { HttpOptions, HttpResult } from "./http.js";
import { ALLOW_ALL, DISALLOW_ALL, parseRobots } from "./robots.js";
import type { Robots } from "./robots.js";

// E9г (D-394): the fetch ladder. 1 http (+ Readability) → 2 a real browser when the page is a JS app or too thin →
// 3 the Wayback Machine's copy when the site refuses or is down → 4 a configured extract provider (Exa contents, Jina…).
// A bot wall or a CAPTCHA is never solved or evaded: the ladder moves on to a copy or another source and the source is
// marked "blocked". robots.txt is respected unless the request turns it off; at most 2 requests per site at a time.

export interface Page {
  url: string;
  finalUrl: string;
  domain: string;
  title: string;
  text: string;
  published: string | null;
  site: string | null;
  description: string | null;
  links: { url: string; text: string }[];
  tier: FetchTier;
  contentHash: Sha256;
}
export interface Attempt {
  url: string;
  domain: string;
  tier: FetchTier;
  status: FetchStatus;
  httpStatus: number | null;
  bytes: number;
  ms: number;
}
export interface Rendered {
  finalUrl: string;
  status: number;
  html: string;
}
/** the browser tier (a hardened Playwright container, D-394) */
export interface Renderer {
  render(url: string, signal?: AbortSignal): Promise<Rendered>;
}
export interface ProviderExtract {
  finalUrl: string;
  title: string;
  text: string;
  published: string | null;
}
export interface Extractor {
  readonly name: string;
  extract(url: string, signal?: AbortSignal): Promise<ProviderExtract | null>;
}
export interface FetcherDeps {
  get?: (url: string, o?: HttpOptions) => Promise<HttpResult>;
  http?: HttpOptions;
  renderer?: Renderer | null;
  extractors?: readonly Extractor[];
  archive?: boolean;
  respectRobots?: boolean;
  /** pause between two requests to one site, ms */
  politeMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export const THIN = 300;
const BLOCK_CODES = new Set([401, 403, 407, 429, 451, 503]);

export class Fetcher {
  private readonly robots = new Map<string, Promise<Robots>>();
  private readonly lastAt = new Map<string, number>();
  private readonly active = new Map<string, number>();
  private readonly get: (url: string, o?: HttpOptions) => Promise<HttpResult>;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(private readonly d: FetcherDeps = {}) {
    this.get = d.get ?? httpGet;
    this.now = d.now ?? Date.now;
    this.sleep = d.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async fetch(url: string, onAttempt: (a: Attempt) => void, signal?: AbortSignal): Promise<Page | null> {
    const domain = domainOf(url);
    const report = (tier: FetchTier, status: FetchStatus, httpStatus: number | null, bytes: number, t0: number) => onAttempt({ url, domain, tier, status, httpStatus, bytes, ms: Math.max(0, this.now() - t0) });
    const t0 = this.now();
    if (this.d.respectRobots !== false && !(await this.robotsOf(url)).allowed(pathOf(url))) {
      report("http", "robots", null, 0, t0);
      return null;
    }
    let reason: "thin" | "blocked" | "failed" = "failed";
    // 1 http
    try {
      const r = await this.polite(domain, () => this.get(url, { ...this.d.http, signal }));
      const ex = await toExtracted(r);
      const blocked = BLOCK_CODES.has(r.status) || ex?.wall === true;
      if (blocked) reason = "blocked";
      else if (r.status >= 400 || ex === null) reason = "failed";
      else if (r.truncated && !r.contentType.includes("html")) reason = "failed";
      else if (ex.text.length >= THIN && !ex.needsBrowser) {
        report("http", "ok", r.status, r.body.length, t0);
        return page(url, r.finalUrl, ex, "http");
      } else reason = "thin";
      report("http", reason === "failed" && r.truncated ? "too_large" : reason, r.status, r.body.length, t0);
    } catch (e) {
      report("http", /refused/.test(String(e)) ? "skipped" : "failed", null, 0, t0);
      if (/refused/.test(String(e))) return null;
    }
    // 2 browser: a JS page or a thin one (never to get past a wall: a wall goes to a copy)
    if (this.d.renderer && reason === "thin") {
      const t1 = this.now();
      try {
        const r = await this.polite(domain, () => (this.d.renderer as Renderer).render(url, signal));
        const ex = extractHtml(r.html, r.finalUrl);
        if (ex.wall || BLOCK_CODES.has(r.status)) report("browser", "blocked", r.status, r.html.length, t1);
        else if (ex.text.length >= THIN) {
          report("browser", "ok", r.status, r.html.length, t1);
          return page(url, r.finalUrl, ex, "browser");
        } else report("browser", "thin", r.status, r.html.length, t1);
      } catch {
        report("browser", "failed", null, 0, t1);
      }
    }
    // 3 the Wayback Machine's copy
    if (this.d.archive !== false) {
      const t2 = this.now();
      try {
        const snap = await this.snapshotOf(url, signal);
        if (snap) {
          const r = await this.get(snap, { ...this.d.http, signal });
          const ex = await toExtracted(r);
          if (r.status < 400 && ex && ex.text.length >= THIN && !ex.wall) {
            report("archive", "ok", r.status, r.body.length, t2);
            return { ...page(url, url, ex, "archive"), finalUrl: snap };
          }
          report("archive", "thin", r.status, r.body.length, t2);
        } else report("archive", "skipped", null, 0, t2);
      } catch {
        report("archive", "failed", null, 0, t2);
      }
    }
    // 4 extract providers
    for (const x of this.d.extractors ?? []) {
      const t3 = this.now();
      try {
        const r = await x.extract(url, signal);
        if (r && r.text.length >= THIN) {
          report("provider", "ok", null, r.text.length, t3);
          return page(url, r.finalUrl, { ...extractText(r.text), title: r.title, published: r.published }, "provider");
        }
        report("provider", "thin", null, r?.text.length ?? 0, t3);
      } catch {
        report("provider", "failed", null, 0, t3);
      }
    }
    return null;
  }

  private async snapshotOf(url: string, signal?: AbortSignal): Promise<string | null> {
    const r = await this.get(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`, { ...this.d.http, accept: "application/json", signal });
    if (r.status !== 200) return null;
    try {
      const j = JSON.parse(r.body.toString("utf8")) as { archived_snapshots?: { closest?: { available?: boolean; url?: string; timestamp?: string } } };
      const c = j.archived_snapshots?.closest;
      if (!c?.available || !c.timestamp || !/^\d{14}$/.test(c.timestamp)) return null;
      // id_ = the page as archived, without the Wayback toolbar
      return `https://web.archive.org/web/${c.timestamp}id_/${url}`;
    } catch {
      return null;
    }
  }

  private robotsOf(url: string): Promise<Robots> {
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      return Promise.resolve(DISALLOW_ALL);
    }
    const cached = this.robots.get(origin);
    if (cached) return cached;
    const p = this.get(`${origin}/robots.txt`, { ...this.d.http, accept: "text/plain", maxBytes: 512 * 1024, timeoutMs: 8_000 }).then(
      (r) => (r.status >= 500 ? DISALLOW_ALL : r.status >= 400 ? ALLOW_ALL : parseRobots(r.body.toString("utf8"), ROBOTS_AGENT)),
      () => ALLOW_ALL,
    );
    this.robots.set(origin, p);
    return p;
  }

  /** ≤ 2 requests at a time per site, and a pause (robots crawl-delay up to 5 s, else politeMs) between them */
  private async polite<T>(domain: string, f: () => Promise<T>): Promise<T> {
    while ((this.active.get(domain) ?? 0) >= 2) await this.sleep(50);
    this.active.set(domain, (this.active.get(domain) ?? 0) + 1);
    try {
      const gap = this.d.politeMs ?? 500;
      const wait = (this.lastAt.get(domain) ?? -Infinity) + gap - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastAt.set(domain, this.now());
      return await f();
    } finally {
      this.active.set(domain, (this.active.get(domain) ?? 1) - 1);
    }
  }
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return "/";
  }
}
async function toExtracted(r: HttpResult): Promise<Extracted | null> {
  const ct = r.contentType;
  if (ct.includes("pdf") || r.body.subarray(0, 5).toString("latin1") === "%PDF-") {
    if (r.truncated) return null;
    try {
      return await extractPdf(r.body);
    } catch {
      return null;
    }
  }
  if (ct.includes("html") || ct.includes("xml") || ct === "") return extractHtml(r.body.toString("utf8"), r.finalUrl);
  if (ct.startsWith("text/") || ct.includes("json") || ct.includes("markdown")) return extractText(r.body.toString("utf8"));
  return null;
}
function page(url: string, finalUrl: string, ex: Extracted, tier: FetchTier): Page {
  return {
    url,
    finalUrl,
    domain: domainOf(finalUrl) || domainOf(url),
    title: ex.title || domainOf(url),
    text: ex.text,
    published: ex.published,
    site: ex.site,
    description: ex.description,
    links: ex.links,
    tier,
    contentHash: sha256Tag(ex.text),
  };
}
