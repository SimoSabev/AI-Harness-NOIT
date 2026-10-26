import type http from "node:http";
import https from "node:https";

// E9г (D-400): paid search providers of research go through the proxy like a model: the research engine has an mdt_
// token, the provider key lives only here (AGENTS.md rule 2). Exa: POST /research/exa/search and /research/exa/contents
// → https://api.exa.ai/{search,contents} with x-api-key. Each call is priced (Exa list prices, research-tools.md [НП])
// and counted against the token's budget like tokens are.

export type SearchProviderId = "exa";
export const SEARCH_ROUTES: Record<string, { provider: SearchProviderId; upstreamPath: string; usd: (body: unknown) => number }> = {
  "/research/exa/search": { provider: "exa", upstreamPath: "/search", usd: (b) => 0.007 + Math.max(0, num((b as { numResults?: unknown }).numResults) - 10) * 0.001 },
  "/research/exa/contents": { provider: "exa", upstreamPath: "/contents", usd: (b) => 0.001 * Math.max(1, Array.isArray((b as { urls?: unknown }).urls) ? ((b as { urls: unknown[] }).urls.length) : 1) },
};
const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
export const SEARCH_UPSTREAM: Record<SearchProviderId, URL> = { exa: new URL("https://api.exa.ai") };

/** forward one search call; resolves with the HTTP status the provider answered (0 = unreachable) */
export function forwardSearch(o: { req: http.IncomingMessage; res: http.ServerResponse; body: Buffer; key: string; target: URL; mod?: typeof https }): Promise<number> {
  return new Promise((done) => {
    const up = (o.mod ?? https).request(o.target, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", "x-api-key": o.key, "content-length": o.body.length } }, (ur) => {
      o.res.writeHead(ur.statusCode ?? 502, { "content-type": String(ur.headers["content-type"] ?? "application/json") });
      ur.pipe(o.res);
      ur.on("end", () => done(ur.statusCode ?? 0));
    });
    up.on("error", () => {
      if (!o.res.headersSent) o.res.writeHead(502, { "content-type": "application/json" }).end(JSON.stringify({ error: "upstream_unreachable" }));
      done(0);
    });
    up.end(o.body);
  });
}
