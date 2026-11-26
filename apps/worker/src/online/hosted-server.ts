import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

// E10 hosted (v5 т. 6.1, D-700): the hosted worker's one HTTP port (8790, behind Caddy): /healthz, the runner protocol
// (/api/runner/*) and the GitHub webhooks (/api/webhooks/github/*). Everything else is 404; Caddy routes only these.

export interface HostedHandlers {
  /** answers /api/runner/* (true) or passes (false) */
  runner?: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
  webhook?: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
}

export function hostedHandler(h: HostedHandlers): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const url = req.url ?? "";
    if (url === "/healthz" && (req.method === "GET" || req.method === "HEAD")) {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("ok");
      return;
    }
    if (url.startsWith("/api/runner/")) {
      if (h.runner && (await h.runner(req, res))) return;
      res.writeHead(503, { "content-type": "application/json; charset=utf-8" });
      res.end('{"error":"runner_protocol_off"}');
      return;
    }
    if (url.startsWith("/api/webhooks/github/")) {
      if (h.webhook) return h.webhook(req, res);
      res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
      res.end("webhook disabled");
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  };
}

export function startHostedServer(h: HostedHandlers, o: { host: string; port: number }): Promise<Server> {
  const handle = hostedHandler(h);
  const s = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end("error");
    });
  });
  return new Promise((resolve) => s.listen(o.port, o.host, () => resolve(s)));
}
