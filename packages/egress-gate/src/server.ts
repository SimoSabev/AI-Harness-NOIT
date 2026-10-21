import net from "node:net";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import dgram from "node:dgram";
import path from "node:path";
import type { Duplex } from "node:stream";
import { GateLogLine, GatePolicySchema } from "@mandat/contract";
import type { GatePolicy } from "@mandat/contract";
import { createRedactor } from "@mandat/redaction";
import { buildDnsResponse, decideDns, parseDnsQuery } from "./dns.js";
import { matchPolicy, matchTunnel } from "./policy.js";

const HOP_BY_HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "proxy-connection",
  "te", "trailer", "transfer-encoding", "upgrade", "host",
]);
const redactor = createRedactor({ exactSecrets: [] });

export interface GateOptions {
  policyDir: string;
  logPath: string;
  npmCacheDir: string;
  llmProxyUrl?: string;
  npmRegistryUrl?: string;
  httpPort?: number;
  dnsPort?: number;
  /** Test hook: mtime polling interval (default 100 ms, D-044). */
  pollMs?: number;
}

function cleanHeaders(h: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(h)) if (!HOP_BY_HOP.has(k.toLowerCase()) && v !== undefined) out[k] = v;
  return out;
}

function cleanResponseHeaders(h: http.IncomingHttpHeaders): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(h)) {
    const lk = k.toLowerCase();
    if (lk === "connection" || lk === "keep-alive" || lk === "transfer-encoding" || lk === "upgrade") continue;
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export async function startGate(o: GateOptions): Promise<{ close(): Promise<void>; httpPort: number; dnsPort: number }> {
  const llmProxy = new URL(o.llmProxyUrl ?? "http://mandat-llm-proxy:8787");
  const npmRegistry = new URL(o.npmRegistryUrl ?? "https://registry.npmjs.org");
  const policyFile = path.join(o.policyDir, "policy.json");
  const selfIpFile = path.join(o.policyDir, "self-ip");
  mkdirSync(path.dirname(o.logPath), { recursive: true });
  mkdirSync(o.npmCacheDir, { recursive: true });

  let policy: GatePolicy | null = null;
  let lastMtime = -1;
  let logChain: Promise<void> = Promise.resolve();

  const log = (line: Omit<GateLogLine, "ts" | "run_id">): void => {
    if (policy === null) return; // D-137: no run_id → no line
    const p = line.path === undefined ? {} : { path: redactor.redactText(line.path).text.slice(0, 200) };
    const q = line.qname === undefined ? {} : { qname: redactor.redactText(line.qname).text.slice(0, 253) };
    const entry = GateLogLine.parse({ ts: new Date().toISOString(), run_id: policy.run_id, ...line, ...p, ...q });
    logChain = logChain.then(() => appendFile(o.logPath, JSON.stringify(entry) + "\n")).catch(() => undefined);
  };

  const loadPolicy = (): void => {
    let mtime: number;
    try {
      mtime = statSync(policyFile).mtimeMs;
    } catch {
      return;
    }
    if (mtime === lastMtime) return;
    lastMtime = mtime;
    try {
      const next = GatePolicySchema.parse(JSON.parse(readFileSync(policyFile, "utf8")));
      policy = next;
      log({ kind: "policy_loaded", phase: next.phase });
    } catch {
      // Invalid policy: keep the previous one (D-044, D-137).
    }
  };
  loadPolicy();
  const timer = setInterval(loadPolicy, o.pollMs ?? 100);

  const readSelfIp = (): string | null => {
    try {
      const ip = readFileSync(selfIpFile, "utf8").trim();
      return /^\d+\.\d+\.\d+\.\d+$/.test(ip) ? ip : null;
    } catch {
      return null;
    }
  };

  const deny = (res: http.ServerResponse, method: string, p: string, reason: string, logIt = true): void => {
    if (logIt) log({ kind: "proxy_block", method, path: p, status: 403 });
    res.writeHead(403, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "mandat_gate_blocked", reason }));
  };

  const forward = (req: http.IncomingMessage, res: http.ServerResponse, target: URL, method: string, p: string): void => {
    const mod = target.protocol === "https:" ? https : http;
    const up = mod.request(target, { method, headers: { ...cleanHeaders(req.headers), host: target.host } }, (ur) => {
      res.writeHead(ur.statusCode ?? 502, cleanResponseHeaders(ur.headers));
      res.flushHeaders();
      let bytes = 0;
      ur.on("data", (c: Buffer) => {
        bytes += c.length;
      });
      ur.pipe(res);
      ur.on("end", () => log({ kind: "allow", method, path: p, status: ur.statusCode ?? 0, bytes }));
    });
    up.setNoDelay(true);
    up.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "mandat_gate_upstream_unreachable" }));
      } else {
        res.destroy();
      }
    });
    req.pipe(up);
  };

  const serveNpm = (req: http.IncomingMessage, res: http.ServerResponse, method: string, p: string): void => {
    const rest = p.slice("/npm".length);
    const target = new URL(npmRegistry.href.replace(/\/$/, "") + rest);
    if (!rest.endsWith(".tgz")) {
      forward(req, res, target, method, p);
      return;
    }
    // D-007: .tgz 200 responses are cached on the host by sha256(path); npm checks integrity itself.
    const file = path.join(o.npmCacheDir, createHash("sha256").update(p).digest("hex"));
    if (existsSync(file)) {
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": statSync(file).size });
      createReadStream(file).pipe(res);
      log({ kind: "allow", method, path: p, status: 200, bytes: statSync(file).size });
      return;
    }
    const mod = target.protocol === "https:" ? https : http;
    const up = mod.get(target, { headers: { accept: "*/*" } }, (ur) => {
      res.writeHead(ur.statusCode ?? 502, cleanResponseHeaders(ur.headers));
      if (ur.statusCode === 200) {
        const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
        const ws = createWriteStream(tmp);
        ur.pipe(ws);
        ws.on("finish", () => {
          try {
            renameSync(tmp, file);
          } catch {
            try {
              unlinkSync(tmp);
            } catch {
              /* ignore */
            }
          }
        });
      }
      ur.pipe(res);
      ur.on("end", () => log({ kind: "allow", method, path: p, status: ur.statusCode ?? 0 }));
    });
    up.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
  };

  const server = http.createServer((req, res) => {
    const method = req.method ?? "GET";
    const p = req.url ?? "/";
    if (policy === null) return deny(res, method, p, "no_policy", false);
    const d = matchPolicy(policy, method, p);
    if (!d.allow) return deny(res, method, p, d.reason);
    const route = d.route;
    if (route.upstream === "local_ok") {
      res.writeHead(200);
      res.end();
      log({ kind: "allow", method, path: p, status: 200 });
      return;
    }
    if (route.upstream === "llm_proxy") {
      forward(req, res, new URL(p, llmProxy), method, p);
      return;
    }
    serveNpm(req, res, method, p);
  });
  server.on("connect", (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    const t = policy ? matchTunnel(policy, req.url ?? "") : ({ allow: false } as const);
    if (!t.allow) {
      log({ kind: "proxy_block", method: "CONNECT", path: (req.url ?? "").slice(0, 200), status: 403 });
      socket.end("HTTP/1.1 403 Forbidden\r\ncontent-length: 0\r\n\r\n");
      return;
    }
    // D-294: a byte pipe to the allowed host; TLS is end to end, the gate logs only host:port (never the content).
    const up = net.connect({ host: t.host, port: t.port }, () => {
      log({ kind: "tunnel", method: "CONNECT", path: `${t.host}:${t.port}`, status: 200 });
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    up.on("error", () => {
      log({ kind: "proxy_block", method: "CONNECT", path: `${t.host}:${t.port}`, status: 502 });
      socket.end("HTTP/1.1 502 Bad Gateway\r\ncontent-length: 0\r\n\r\n");
    });
    socket.on("error", () => up.destroy());
  });
  // E3в: no websocket (Codex's built-in provider prefers websockets; ours is plain HTTPS through the proxy)
  server.on("upgrade", (req: http.IncomingMessage, socket: Duplex) => {
    log({ kind: "proxy_block", method: `${req.method ?? "GET"} upgrade`, path: (req.url ?? "").split("?")[0] ?? "", status: 403 });
    socket.end("HTTP/1.1 403 Forbidden\r\ncontent-length: 0\r\n\r\n");
  });

  const udp = dgram.createSocket("udp4");
  udp.on("message", (msg, rinfo) => {
    const q = parseDnsQuery(msg);
    if (q === null) return;
    const decision = policy === null ? { answer: { kind: "servfail" as const }, logBlock: false } : decideDns(q, readSelfIp());
    if (decision.logBlock) log({ kind: "dns_block", qname: q.name, qtype: q.qtype });
    udp.send(buildDnsResponse(q, decision.answer), rinfo.port, rinfo.address);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(o.httpPort ?? 80, "0.0.0.0", () => resolve());
  });
  await new Promise<void>((resolve, reject) => {
    udp.once("error", reject);
    udp.bind(o.dnsPort ?? 53, "0.0.0.0", () => resolve());
  });
  const addr = server.address();
  return {
    httpPort: typeof addr === "object" && addr ? addr.port : 0,
    dnsPort: udp.address().port,
    async close() {
      clearInterval(timer);
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      await new Promise<void>((r) => udp.close(() => r()));
      await logChain;
    },
  };
}
