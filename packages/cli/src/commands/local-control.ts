import { createServer } from "node:http";
import type { IncomingMessage } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AccountName, AddProjectBody, ConnectionId, LocalPath, LoginCode, LoginStart, SubscriptionId, SystemJob } from "@mandat/contract";
import type { AddConnectionReply, AddProjectReply, CheckKeyReply, ConnectionsReply, DetectReply, FolderListing, FoundProjects, JobState, LoginState } from "@mandat/contract";

// D-293: the web UI of `mandat local` hands API keys to the proxy through this control endpoint: 127.0.0.1 only,
// a random bearer token known to the web server alone, the key only in memory on its way to `docker run` env.
// Nothing here logs, stores or echoes a key.
const Key = z.string().regex(/^[\x21-\x7e]{20,512}$/);
export const KeysBody = z.object({ anthropic: Key, openai: Key.optional() }).strict();
export type Keys = z.infer<typeof KeysBody>;
/** D-440: the research search key (Exa) — the same shape as a model key */
export const ResearchKeyBody = z.object({ exa: Key }).strict();

export interface ControlDeps {
  start(k: Keys): Promise<boolean>;
  stop(): Promise<void>;
  providers(): Promise<string[] | null>;
  /** D-295: the subscription accounts (from `claude auth status`; no token) */
  accounts(): Promise<{ name: string; agent: string; loggedIn: boolean; email: string | null; plan: string | null }[]>;
  /** D-369: the subscription login from the web (login-session.ts) */
  login: { state(): LoginState; start(name: string, cli: SubscriptionId): Promise<LoginState>; submit(code: string): LoginState | null; cancel(): LoginState };
  logout(name: string, cli: SubscriptionId): Promise<boolean>;
  /** D-370: the CLI commands from the web (system-jobs.ts) */
  system: { all(): JobState[]; start(job: SystemJob): JobState };
  /** D-388: "Add project" from the web — a git folder of this computer becomes a project (add-project.ts) */
  addProject(path: string): Promise<AddProjectReply>;
  /** D-388 (folder picker): the folders of this computer for "Add project" (folders.ts); list → null when not a folder */
  folders?: { list(path: string | undefined): Promise<FolderListing | null>; found(): Promise<FoundProjects> };
  /** D-440: the research search key — sealed by `mandat local` and the proxy restarted with it */
  research?: { set(k: z.infer<typeof ResearchKeyBody>): Promise<boolean>; clear(): Promise<boolean> };
  /** D-393: saved connections, local model discovery, the task box defaults (connections.ts) */
  connections?: {
    list(): Promise<ConnectionsReply>;
    add(body: unknown): Promise<AddConnectionReply>;
    setModels(id: string, body: unknown): Promise<boolean>;
    remove(id: string): Promise<boolean>;
    /** D-472: "Check the key" of a saved connection; null = unknown id */
    check(id: string): Promise<CheckKeyReply | null>;
    detect(): Promise<DetectReply>;
    setPrefs(body: unknown): boolean;
  };
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

async function readJson(req: IncomingMessage): Promise<unknown> {
  const raw = await readBody(req);
  try {
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

const NameBody = z.object({ name: AccountName, cli: SubscriptionId.default("claude") }).strict();
const CodeBody = z.object({ code: LoginCode }).strict();

/** D-369: /accounts/login (GET state, POST start, DELETE cancel), /accounts/login/code, /accounts/logout. The code is never echoed. */
async function accountsRoute(url: string, method: string, body: () => Promise<unknown>, d: ControlDeps): Promise<[number, unknown]> {
  if (url === "/accounts/login") {
    if (method === "GET") return [200, d.login.state()];
    if (method === "DELETE") return [200, d.login.cancel()];
    if (method !== "POST") return [405, { error: "method" }];
    const b = LoginStart.safeParse(await body());
    return b.success ? [200, await d.login.start(b.data.name, b.data.cli)] : [400, { error: "bad_name" }];
  }
  if (method !== "POST") return url === "/accounts/login/code" || url === "/accounts/logout" ? [405, { error: "method" }] : [404, { error: "not_found" }];
  if (url === "/accounts/login/code") {
    const b = CodeBody.safeParse(await body());
    const s = b.success ? d.login.submit(b.data.code) : null;
    return s ? [200, s] : [400, { error: b.success ? "not_waiting" : "bad_code" }];
  }
  if (url === "/accounts/logout") {
    const b = NameBody.safeParse(await body());
    return b.success ? [200, { removed: await d.logout(b.data.name, b.data.cli) }] : [400, { error: "bad_name" }];
  }
  return [404, { error: "not_found" }];
}

/** D-393: /connections (GET list, POST add), /connections/detect, /connections/<id> (PATCH models, DELETE), D-472: /connections/<id>/check (POST), /preferences (PUT). */
async function connectionsRoute(url: string, method: string, body: () => Promise<unknown>, c: NonNullable<ControlDeps["connections"]>): Promise<[number, unknown]> {
  if (url === "/preferences") return method === "PUT" ? (c.setPrefs(await body()) ? [200, { ok: true }] : [400, { error: "bad_preferences" }]) : [405, { error: "method" }];
  if (url === "/connections") {
    if (method === "GET") return [200, await c.list()];
    if (method !== "POST") return [405, { error: "method" }];
    const r = await c.add(await body());
    return [r.ok || r.error !== "bad_address" ? 200 : 400, r];
  }
  if (url === "/connections/detect") return method === "GET" ? [200, await c.detect()] : [405, { error: "method" }];
  const chk = /^\/connections\/([^/]+)\/check$/.exec(url);
  if (chk) {
    const cid = ConnectionId.safeParse(chk[1]);
    if (!cid.success) return [404, { error: "not_found" }];
    if (method !== "POST") return [405, { error: "method" }];
    const r = await c.check(cid.data);
    return r === null ? [404, { error: "unknown_connection" }] : [200, r];
  }
  const id = ConnectionId.safeParse(url.slice("/connections/".length));
  if (!id.success) return [404, { error: "not_found" }];
  if (method === "PATCH") return (await c.setModels(id.data, await body())) ? [200, { ok: true }] : [400, { error: "bad_models" }];
  if (method === "DELETE") return [200, { removed: await c.remove(id.data) }];
  return [405, { error: "method" }];
}

/** D-388 (folder picker): GET /folders?path=… (no path → the home folder), GET /folders/found. Names and paths only. */
async function foldersRoute(pathname: string, query: URLSearchParams, method: string, f: NonNullable<ControlDeps["folders"]>): Promise<[number, unknown]> {
  if (method !== "GET") return [405, { error: "method" }];
  if (pathname === "/folders/found") return [200, await f.found()];
  const raw = query.get("path");
  const p = raw === null || raw === "" ? undefined : LocalPath.safeParse(raw);
  if (p !== undefined && !p.success) return [400, { error: "bad_path" }];
  const l = await f.list(p?.data);
  return l ? [200, l] : [404, { error: "not_a_folder" }];
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
    if (req.url === "/accounts" && req.method === "GET") {
      void d.accounts().then((accounts) => send(200, { accounts }), () => send(500, { error: "internal" }));
      return;
    }
    if (req.url === "/system" || req.url?.startsWith("/system/")) {
      const job = SystemJob.safeParse(req.url.slice("/system/".length));
      if (req.url === "/system") return req.method === "GET" ? send(200, { jobs: d.system.all() }) : send(405, { error: "method" });
      if (!job.success) return send(404, { error: "not_found" });
      return req.method === "POST" ? send(200, d.system.start(job.data)) : send(405, { error: "method" });
    }
    const at = new URL(req.url ?? "/", "http://127.0.0.1");
    if (at.pathname === "/folders" || at.pathname === "/folders/found") {
      if (!d.folders) return send(404, { error: "not_found" });
      void foldersRoute(at.pathname, at.searchParams, req.method ?? "GET", d.folders).then(([code, body]) => send(code, body), () => send(500, { error: "internal" }));
      return;
    }
    if (req.url === "/projects") {
      if (req.method !== "POST") return send(405, { error: "method" });
      void readJson(req).then(async (raw) => {
        const b = AddProjectBody.safeParse(raw);
        return b.success ? send(200, await d.addProject(b.data.path)) : send(400, { error: "bad_path" });
      }).catch(() => send(500, { error: "internal" }));
      return;
    }
    if (d.connections && (req.url === "/connections" || req.url?.startsWith("/connections/") || req.url === "/preferences")) {
      void connectionsRoute(req.url, req.method ?? "GET", () => readJson(req), d.connections).then(([code, body]) => send(code, body), () => send(500, { error: "internal" }));
      return;
    }
    if (req.url?.startsWith("/accounts/")) {
      void accountsRoute(req.url, req.method ?? "GET", () => readJson(req), d).then(([code, body]) => send(code, body), () => send(500, { error: "internal" }));
      return;
    }
    if (req.url === "/keys/research") {
      const r = d.research;
      if (!r) return send(404, { error: "not_found" });
      if (req.method !== "POST" && req.method !== "DELETE") return send(405, { error: "method" });
      void (async () => {
        if (req.method === "DELETE") return (await r.clear()) ? send(200, await status()) : send(502, { error: "proxy_start_failed" });
        const b = ResearchKeyBody.safeParse(await readJson(req));
        if (!b.success) return send(400, { error: "bad_keys" });
        return (await r.set(b.data)) ? send(200, await status()) : send(502, { error: "proxy_start_failed" });
      })().catch(() => send(500, { error: "internal" }));
      return;
    }
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
