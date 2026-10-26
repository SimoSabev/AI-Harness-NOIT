import { lookup as dnsLookup } from "node:dns";
import type { LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { MandatError } from "@mandat/contract";
import { checkUrl, isPublicAddress } from "./ssrf.js";

// E9г (AC-13.6): the one way the engine reads the web. Every hop is checked (checkUrl), the socket connects only to an
// address that passed isPublicAddress (custom lookup = the address is pinned), at most 5 redirects, 5 MB, 20 s.
// No cookies are kept; a page is untrusted text.

export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 MandatResearch/0.1";
export const ROBOTS_AGENT = "MandatResearch";

export interface HttpResult {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  body: Buffer;
  ms: number;
  truncated: boolean;
}
export interface HttpOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  accept?: string;
  headers?: Record<string, string>;
  /** tests: a resolver; production: the system resolver */
  resolve?: (host: string) => Promise<LookupAddress[]>;
  /** tests only: 127.0.0.1 (any port) is let through; everything else is checked as usual */
  loopbackForTests?: boolean;
  signal?: AbortSignal | undefined;
  now?: () => number;
}

const systemResolve = (host: string) => new Promise<LookupAddress[]>((ok, bad) => dnsLookup(host, { all: true, verbatim: true }, (e, a) => (e ? bad(e) : ok(a))));

export async function httpGet(rawUrl: string, o: HttpOptions = {}): Promise<HttpResult> {
  const now = o.now ?? Date.now;
  const t0 = now();
  const maxBytes = o.maxBytes ?? 5 * 1024 * 1024;
  const deadline = t0 + (o.timeoutMs ?? 20_000);
  let url = rawUrl;
  for (let hop = 0; hop <= (o.maxRedirects ?? 5); hop++) {
    const c = checkUrl(url);
    const loop = o.loopbackForTests === true && c.ok === false && /^http:\/\/127\.0\.0\.1(:\d+)?\//.test(url);
    if (!c.ok && !loop) throw new MandatError("E_RESEARCH_SSRF", `refused: ${c.why}`);
    const u = new URL(url);
    const r = await once(u, o, maxBytes, Math.max(1, deadline - now()));
    if (r.status >= 300 && r.status < 400 && r.location) {
      url = new URL(r.location, u).toString();
      continue;
    }
    return { url: rawUrl, finalUrl: u.toString(), status: r.status, contentType: r.contentType, body: r.body, ms: now() - t0, truncated: r.truncated };
  }
  throw new MandatError("E_RESEARCH_FETCH", "too many redirects");
}

function once(u: URL, o: HttpOptions, maxBytes: number, timeoutMs: number): Promise<{ status: number; location: string | null; contentType: string; body: Buffer; truncated: boolean }> {
  const resolve = o.resolve ?? systemResolve;
  const lookup: LookupFunction = (host, opts, cb) => {
    resolve(host).then(
      (all) => {
        const ok = all.filter((a) => isPublicAddress(a.address) || (o.loopbackForTests === true && a.address === "127.0.0.1"));
        const first = ok[0];
        if (!first) return cb(new MandatError("E_RESEARCH_SSRF", "refused: the name resolves to a private address"), "", 4);
        if ((opts as { all?: boolean }).all) (cb as unknown as (e: null, a: LookupAddress[]) => void)(null, [first]);
        else cb(null, first.address, first.family);
      },
      (e: Error) => cb(e as NodeJS.ErrnoException, "", 4),
    );
  };
  return new Promise((done, fail) => {
    const lib = u.protocol === "https:" ? https : http;
    const signal = o.signal ? AbortSignal.any([o.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    const req = lib.request(
      u,
      {
        method: "GET",
        lookup,
        signal,
        headers: { "user-agent": UA, accept: o.accept ?? "text/html,application/xhtml+xml,application/pdf;q=0.9,text/plain;q=0.8,*/*;q=0.5", "accept-language": "en,bg;q=0.8", "accept-encoding": "gzip, deflate, br", ...o.headers },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
        if (status >= 300 && status < 400) {
          res.resume();
          return done({ status, location, contentType, body: Buffer.alloc(0), truncated: false });
        }
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream = enc === "gzip" ? res.pipe(createGunzip()) : enc === "br" ? res.pipe(createBrotliDecompress()) : enc === "deflate" ? res.pipe(createInflate()) : res;
        const parts: Buffer[] = [];
        let n = 0;
        let truncated = false;
        stream.on("data", (b: Buffer) => {
          if (truncated) return;
          n += b.length;
          if (n > maxBytes) {
            truncated = true;
            parts.push(b.subarray(0, b.length - (n - maxBytes)));
            req.destroy();
            done({ status, location, contentType, body: Buffer.concat(parts), truncated });
            return;
          }
          parts.push(b);
        });
        stream.on("end", () => done({ status, location, contentType, body: Buffer.concat(parts), truncated }));
        stream.on("error", (e: Error) => (truncated ? undefined : fail(new MandatError("E_RESEARCH_FETCH", e.message))));
      },
    );
    req.on("error", (e: Error) => fail(e instanceof MandatError ? e : new MandatError("E_RESEARCH_FETCH", signal.aborted ? "timeout" : e.message)));
    req.end();
  });
}
