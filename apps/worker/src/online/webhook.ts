import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { Webhooks } from "@octokit/webhooks";

// Демо промпт т. 6.5 (D-215): node:http on MANDAT_WEBHOOK_HOST (127.0.0.1) : MANDAT_WEBHOOK_PORT (8790).
// POST /api/webhooks/github/{observer,writer}; signature via @octokit/webhooks; dedupe by X-GitHub-Delivery.

export interface WebhookDeps {
  secrets: { observer: string | null; writer: string | null };
  /** true = new delivery (stored), false = already seen (sync_events.delivery_id unique) */
  record(e: { app: "observer" | "writer"; delivery: string; event: string; payload: unknown }): Promise<boolean>;
  security(kind: "webhook_bad_signature", detail: Record<string, string>): void;
  maxBytes?: number;
}

const MAX = 5 * 1024 * 1024;

async function readBody(req: IncomingMessage, max: number): Promise<string | null> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > max) return null;
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function webhookHandler(d: WebhookDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const hooks = { observer: d.secrets.observer ? new Webhooks({ secret: d.secrets.observer }) : null, writer: d.secrets.writer ? new Webhooks({ secret: d.secrets.writer }) : null };
  return async (req, res) => {
    const send = (code: number, body: string) => {
      res.writeHead(code, { "content-type": "text/plain; charset=utf-8" });
      res.end(body);
    };
    const m = /^\/api\/webhooks\/github\/(observer|writer)$/.exec(req.url ?? "");
    if (req.method !== "POST" || !m) return send(404, "not found");
    const app = m[1] as "observer" | "writer";
    const wh = hooks[app];
    if (!wh) return send(503, "webhook disabled");
    const body = await readBody(req, d.maxBytes ?? MAX);
    if (body === null) return send(413, "too large");
    const sig = String(req.headers["x-hub-signature-256"] ?? "");
    const delivery = String(req.headers["x-github-delivery"] ?? "");
    const event = String(req.headers["x-github-event"] ?? "");
    const ok = sig !== "" && (await wh.verify(body, sig).catch(() => false));
    if (!ok) {
      d.security("webhook_bad_signature", { app, delivery: delivery.slice(0, 64), event: event.slice(0, 64) });
      return send(401, "bad signature");
    }
    if (!/^[0-9a-f-]{8,64}$/i.test(delivery) || !/^[a-z_]{1,64}$/.test(event)) return send(400, "bad headers");
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return send(400, "bad json");
    }
    const fresh = await d.record({ app, delivery, event, payload });
    return send(fresh ? 202 : 200, fresh ? "accepted" : "duplicate");
  };
}

export function startWebhookServer(d: WebhookDeps, o: { host: string; port: number }): Promise<Server> {
  const h = webhookHandler(d);
  const s = createServer((req, res) => {
    h(req, res).catch(() => {
      res.writeHead(500);
      res.end("error");
    });
  });
  return new Promise((resolve) => s.listen(o.port, o.host, () => resolve(s)));
}
