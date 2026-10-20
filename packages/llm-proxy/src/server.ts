import http from "node:http";
import https from "node:https";
import { ALLOWED_MODELS, costUsd } from "./pricing.js";
import type { Usage } from "./pricing.js";
import { SseUsage, mergeUsage } from "./sse-usage.js";
import { ProxyState } from "./state.js";
import type { RequestLine } from "./state.js";
import { adminBearer, tokenPrefix8, verifyTaskToken } from "./token.js";

export const PROXY_VERSION = "0.1.0";
const INFERENCE_PATHS = new Set(["/v1/messages", "/v1/messages/count_tokens"]);
const MAX_BODY = 32 * 1024 * 1024;
const DROP_REQ = new Set(["host", "connection", "keep-alive", "proxy-authorization", "authorization", "x-api-key", "content-length", "transfer-encoding", "te", "upgrade"]);
const DROP_RES = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade"]);

type ErrType = "authentication_error" | "permission_error" | "api_error" | "invalid_request_error";
function apiError(res: http.ServerResponse, status: number, type: ErrType, code: string, extra: Record<string, string> = {}): void {
  res.writeHead(status, { "content-type": "application/json", ...extra });
  res.end(JSON.stringify({ type: "error", error: { type, message: `mandat: ${code}` } }));
}

function readBody(req: http.IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let n = 0;
    req.on("data", (c: Buffer) => {
      n += c.length;
      if (n > MAX_BODY) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(null));
  });
}

function bearerOf(req: http.IncomingMessage): string | null {
  const k = req.headers["x-api-key"];
  if (typeof k === "string" && k.length > 0) return k;
  const a = req.headers.authorization;
  if (typeof a === "string" && a.startsWith("Bearer ")) return a.slice(7);
  return null;
}

export interface ProxyServerOptions {
  secret: Buffer;
  apiKey: string;
  upstream: string;
  usageLogPath: string;
  /** stdout log line (never bodies, headers or token values; 8.1). */
  log?: (line: RequestLine) => void;
  now?: () => number;
}

export function createProxyServer(o: ProxyServerOptions): { inference: http.Server; admin: http.Server; state: ProxyState } {
  const state = new ProxyState(o.usageLogPath, (m) => process.stdout.write(`${m}\n`));
  const upstream = new URL(o.upstream);
  const now = o.now ?? (() => Date.now());
  const log = o.log ?? ((l: RequestLine) => process.stdout.write(JSON.stringify(l) + "\n"));
  const admin = adminBearer(o.secret);

  const record = (l: Omit<RequestLine, "kind" | "ts">): void => {
    const line: RequestLine = { kind: "request", ts: new Date(now()).toISOString(), ...l };
    state.record(line);
    log(line);
  };

  const inference = http.createServer((req, res) => {
    void (async () => {
      const method = req.method ?? "GET";
      const fullPath = req.url ?? "/";
      const p = fullPath.split("?")[0] ?? "/";
      const token = bearerOf(req);
      const base = { method, path: p, model: null, input_tokens: 0, output_tokens: 0, cache_read: 0, cache_write: 0, usd: 0 };
      const reject = (status: number, type: ErrType, code: string, runId: string | null, extra: Record<string, string> = {}) => {
        record({ ...base, run_id: runId, status, token_prefix8: token ? tokenPrefix8(token) : null });
        apiError(res, status, type, code, extra);
      };
      if (method !== "POST" || !INFERENCE_PATHS.has(p)) {
        req.resume();
        return reject(403, "permission_error", "path_not_allowed", null);
      }
      if (token === null) return reject(401, "authentication_error", "token_invalid", null);
      const v = verifyTaskToken(o.secret, token, Math.floor(now() / 1000));
      if (!v.ok) return reject(401, "authentication_error", v.code, null);
      const runId = v.claims.r;
      if (state.revoked.has(runId)) return reject(401, "authentication_error", "token_revoked", runId);
      const run = state.get(runId);
      run.budget = v.claims.b;
      if (run.usd >= v.claims.b) {
        return reject(403, "permission_error", "budget_exhausted", runId, { "x-should-retry": "false" });
      }
      const body = await readBody(req);
      if (body === null) return reject(403, "permission_error", "path_not_allowed", runId);
      let model: string | null = null;
      try {
        const j = JSON.parse(body.toString("utf8")) as { model?: unknown };
        model = typeof j.model === "string" ? j.model : null;
      } catch {
        model = null;
      }
      if (model === null || !ALLOWED_MODELS.includes(model)) return reject(403, "permission_error", "model_not_allowed", runId);

      const headers: http.OutgoingHttpHeaders = {};
      for (const [k, val] of Object.entries(req.headers)) if (!DROP_REQ.has(k.toLowerCase()) && val !== undefined) headers[k] = val;
      headers["x-api-key"] = o.apiKey;
      headers["content-length"] = body.length;
      const target = new URL(fullPath, upstream);
      const mod = target.protocol === "https:" ? https : http;
      const isCount = p === "/v1/messages/count_tokens";
      const up = mod.request(target, { method: "POST", headers }, (ur) => {
        const out: http.OutgoingHttpHeaders = {};
        for (const [k, val] of Object.entries(ur.headers)) if (!DROP_RES.has(k.toLowerCase()) && val !== undefined) out[k] = val;
        res.writeHead(ur.statusCode ?? 502, out);
        res.flushHeaders();
        const sse = String(ur.headers["content-type"] ?? "").includes("text/event-stream");
        const parser = new SseUsage();
        const jsonChunks: Buffer[] = [];
        let jsonBytes = 0;
        ur.on("data", (c: Buffer) => {
          if (sse) parser.push(c.toString("utf8"));
          else if (jsonBytes < MAX_BODY) {
            jsonChunks.push(c);
            jsonBytes += c.length;
          }
          res.write(c);
        });
        ur.on("end", () => {
          res.end();
          let usage: Usage = { input_tokens: 0, output_tokens: 0 };
          if (sse) {
            parser.end();
            usage = parser.usage;
          } else {
            try {
              const j = JSON.parse(Buffer.concat(jsonChunks).toString("utf8")) as { usage?: Partial<Usage> };
              if (j.usage) mergeUsage(usage, j.usage);
            } catch {
              usage = { input_tokens: 0, output_tokens: 0 };
            }
          }
          const usd = isCount || (ur.statusCode ?? 500) >= 400 ? 0 : (costUsd(model, usage) ?? 0);
          const cacheWrite =
            usage.cache_creation !== undefined
              ? (usage.cache_creation.ephemeral_5m_input_tokens ?? 0) + (usage.cache_creation.ephemeral_1h_input_tokens ?? 0)
              : (usage.cache_creation_input_tokens ?? 0);
          record({
            method, path: p, run_id: runId, status: ur.statusCode ?? 0, model,
            input_tokens: isCount ? 0 : usage.input_tokens, output_tokens: isCount ? 0 : usage.output_tokens,
            cache_read: isCount ? 0 : (usage.cache_read_input_tokens ?? 0), cache_write: isCount ? 0 : cacheWrite,
            usd, token_prefix8: tokenPrefix8(token),
          });
        });
      });
      up.on("error", () => {
        if (!res.headersSent) reject(502, "api_error", "upstream_unreachable", runId);
        else res.destroy();
      });
      up.end(body);
    })();
  });

  const adminServer = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://admin");
      if (req.method === "GET" && url.pathname === "/healthz") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, version: PROXY_VERSION }));
        return;
      }
      if (req.headers.authorization !== `Bearer ${admin}`) {
        req.resume();
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }
      if (req.method === "POST" && url.pathname === "/admin/revoke") {
        const body = await readBody(req);
        let runId: unknown;
        try {
          runId = (JSON.parse(body?.toString("utf8") ?? "") as { run_id?: unknown }).run_id;
        } catch {
          runId = undefined;
        }
        if (typeof runId !== "string") {
          res.writeHead(400).end();
          return;
        }
        state.revoke(runId);
        res.writeHead(204).end();
        return;
      }
      if (req.method === "GET" && url.pathname === "/admin/usage") {
        const runId = url.searchParams.get("run_id") ?? "";
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(state.usage(runId)));
        return;
      }
      req.resume();
      res.writeHead(404).end();
    })();
  });

  return { inference, admin: adminServer, state };
}
