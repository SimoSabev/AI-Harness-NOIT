import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// D-293: the web UI of `mandat local` hands API keys to the proxy through this control endpoint: 127.0.0.1 only,
// a random bearer token known to the web server alone, the key only in memory on its way to `docker run` env.
// Nothing here logs, stores or echoes a key.
const Key = z.string().regex(/^[\x21-\x7e]{20,512}$/);
export const KeysBody = z.object({ anthropic: Key, openai: Key.optional() }).strict();
export type Keys = z.infer<typeof KeysBody>;

export interface ControlDeps {
  start(k: Keys): Promise<boolean>;
  stop(): Promise<void>;
  providers(): Promise<string[] | null>;
}

const MAX_BODY = 4096;

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let n = 0;
    const parts: Buffer[] = [];
    req.on("data", (b: Buffer) => {
      n += b.length;
      if (n > MAX_BODY) {
        resolve(null);
        req.destroy();
      } else parts.push(b);
    });
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    req.on("error", () => resolve(null));
  });
}

export async function startControl(d: ControlDeps): Promise<{ url: string; token: string; close(): Promise<void> }> {
  const token = randomBytes(32).toString("hex");
  const want = Buffer.from(`Bearer ${token}`);
  const status = async () => {
    const p = await d.providers();
    return { proxy: p === null ? "stopped" : "running", providers: p ?? [] };
  };
  const server = createServer((req, res) => {
    const send = (code: number, body: unknown) => {
      res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };
    const got = Buffer.from(String(req.headers.authorization ?? ""));
    if (got.length !== want.length || !timingSafeEqual(got, want)) return send(401, { error: "unauthorized" });
    if (req.url !== "/keys") return send(404, { error: "not_found" });
    void (async () => {
      try {
        if (req.method === "GET") return send(200, await status());
        if (req.method === "DELETE") {
          await d.stop();
          return send(200, await status());
        }
        if (req.method !== "POST") return send(405, { error: "method" });
        const raw = await readBody(req);
        let parsed: unknown = null;
        try {
          parsed = raw === null ? null : JSON.parse(raw);
        } catch {
          parsed = null;
        }
        const b = KeysBody.safeParse(parsed);
        if (!b.success) return send(400, { error: "bad_keys" });
        if (!(await d.start(b.data))) return send(502, { error: "proxy_start_failed" });
        return send(200, await status());
      } catch {
        return send(500, { error: "internal" });
      }
    })();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  return { url: `http://127.0.0.1:${port}`, token, close: () => new Promise((r) => server.close(() => r())) };
}
