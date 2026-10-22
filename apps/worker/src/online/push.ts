import { lookup } from "node:dns/promises";
import net from "node:net";

// Демо промпт т. 8.4 (S18): the push endpoint is a URL from the client → checked on write AND on every send:
// https:, host by suffix allowlist, port 443 only, every resolved IP public, no redirects, 10 s timeout.
export const PUSH_HOST_SUFFIXES = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "push.apple.com", "notify.windows.com"] as const;
export type PushCheck = { ok: true; url: URL; address: string | null } | { ok: false; reason: "scheme" | "host" | "port" | "private_ip" | "dns" | "bad_url" | "test_endpoint" };

const v4ToInt = (ip: string) => ip.split(".").reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
const inV4 = (ip: string, cidr: string) => {
  const [base, bits] = cidr.split("/") as [string, string];
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
};
const V4_BLOCK = ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.168.0.0/16", "224.0.0.0/4", "240.0.0.0/4"];

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return V4_BLOCK.some((c) => inV4(ip, c));
  if (!net.isIPv6(ip)) return true;
  const x = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
  if (mapped) return isPrivateIp(mapped[1] as string);
  return x === "::1" || x === "::" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || /^ff/.test(x);
}

export function hostAllowed(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  return PUSH_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
}

export async function checkPushEndpoint(raw: string, o: { env?: Record<string, string | undefined>; resolve?: (host: string) => Promise<string[]> } = {}): Promise<PushCheck> {
  const env = o.env ?? process.env;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "bad_url" };
  }
  const test = env.MANDAT_PUSH_TEST_ENDPOINT;
  if (test && raw.startsWith(test)) {
    // only for tests, and only with NODE_ENV=test (a local fake push service)
    return env.NODE_ENV === "test" ? { ok: true, url, address: null } : { ok: false, reason: "test_endpoint" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "scheme" };
  if (url.port !== "" && url.port !== "443") return { ok: false, reason: "port" };
  if (url.username || url.password || !hostAllowed(url.hostname)) return { ok: false, reason: "host" };
  let ips: string[];
  try {
    ips = await (o.resolve ?? (async (h: string) => (await lookup(h, { all: true })).map((a) => a.address)))(url.hostname);
  } catch {
    return { ok: false, reason: "dns" };
  }
  if (ips.length === 0) return { ok: false, reason: "dns" };
  if (ips.some(isPrivateIp)) return { ok: false, reason: "private_ip" };
  return { ok: true, url, address: ips[0] as string };
}

// Payload (Ф4): no secrets — task_id, kind, a title ≤ 80 chars, the verdict word, the level.
export type NotifyKind = "waiting" | "failed" | "merged" | "expired";
const WORD: Record<string, string> = { VERIFIED: "ПРОВЕРЕНО", FAILED: "ПРОВАЛ", UNKNOWN: "НЕИЗВЕСТНО" };
export function pushPayload(o: { task_id: string; kind: NotifyKind; text: string; result: string | null; level: number | null }): string {
  const head = o.kind === "waiting" ? "Чака теб" : o.kind === "failed" ? "ПРОВАЛ" : o.kind === "expired" ? "Изтече (затворена)" : "Слято само";
  const raw = `${head}: ${o.text.replace(/\s+/g, " ").trim()}`;
  const title = [...raw].length > 80 ? `${[...raw].slice(0, 79).join("")}…` : raw;
  return JSON.stringify({ task_id: o.task_id, kind: o.kind, title, verdict: o.result ? (WORD[o.result] ?? o.result) : null, level: o.level });
}

// ---- sending (the worker only; outbox kind web_push). web-push builds the encrypted, VAPID-signed request; we send it
// ourselves so the connection goes to the IP we checked (no DNS rebinding), never follows redirects, times out in 10 s.
export interface PushSub { id: string; endpoint: string; p256dh: string; auth: string }
export interface Vapid { subject: string; publicKey: string; privateKey: string }
export type SendResult = { ok: true; status: number } | { ok: false; status: number | null; reason: string; gone: boolean };

export async function sendWebPush(sub: PushSub, payload: string, o: { vapid: Vapid; env?: Record<string, string | undefined>; resolve?: (h: string) => Promise<string[]> }): Promise<SendResult> {
  const c = await checkPushEndpoint(sub.endpoint, { ...(o.env ? { env: o.env } : {}), ...(o.resolve ? { resolve: o.resolve } : {}) });
  if (!c.ok) return { ok: false, status: null, reason: `endpoint_${c.reason}`, gone: false };
  const { generateRequestDetails } = (await import("web-push")).default;
  const req = generateRequestDetails({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
    TTL: 3600,
    vapidDetails: { subject: o.vapid.subject, publicKey: o.vapid.publicKey, privateKey: o.vapid.privateKey },
  });
  const http = await import("node:http");
  const https = await import("node:https");
  const isHttps = c.url.protocol === "https:";
  const address = c.address;
  return new Promise<SendResult>((resolve) => {
    const r = (isHttps ? https : http).request(
      c.url,
      {
        method: req.method,
        headers: req.headers as Record<string, string>,
        timeout: 10_000,
        ...(isHttps && address
          ? { servername: c.url.hostname, lookup: (_h: string, _o: unknown, cb: (e: null, a: string, f: number) => void) => cb(null, address, net.isIPv6(address) ? 6 : 4) }
          : {}),
      },
      (res) => {
        res.resume();
        const s = res.statusCode ?? 0;
        if (s >= 200 && s < 300) resolve({ ok: true, status: s });
        else resolve({ ok: false, status: s, reason: s >= 300 && s < 400 ? "redirect_refused" : `http_${s}`, gone: s === 404 || s === 410 });
      },
    );
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", (e) => resolve({ ok: false, status: null, reason: e.message === "timeout" ? "timeout" : "network", gone: false }));
    r.end(req.body ?? undefined);
  });
}

export function vapidFromEnv(env: Record<string, string | undefined>): Vapid | null {
  const { VAPID_SUBJECT: subject, VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = env;
  return subject && publicKey && privateKey ? { subject, publicKey, privateKey } : null;
}

/** Outbox `web_push` {task_id, kind}: every subscription of the task's org; 404/410 → the subscription is deleted. */
export function webPushHandler(d: { db: { query<T = Record<string, unknown>>(t: string, p?: unknown[]): Promise<{ rows: T[] }> }; env?: Record<string, string | undefined>; resolve?: (h: string) => Promise<string[]>; log?: (l: string) => void }) {
  return async (row: { payload: Record<string, unknown> }): Promise<void> => {
    const vapid = vapidFromEnv(d.env ?? process.env);
    const taskId = String(row.payload.task_id ?? "");
    const kind = String(row.payload.kind ?? "") as NotifyKind;
    if (!/^t_[a-z0-9_]{1,40}$/.test(taskId) || !["waiting", "failed", "merged", "expired"].includes(kind)) throw new Error("web_push: bad payload");
    if (!vapid) {
      d.log?.("[push] SKIPPED: VAPID keys are not set (docs/setup/push.md)");
      return;
    }
    const t = (await d.db.query<{ org_id: string; text: string; last_result: string | null; effective_level: number | null }>("select org_id::text as org_id, text, last_result, effective_level from public.tasks where id = $1", [taskId])).rows[0];
    if (!t) return;
    const subs = (await d.db.query<PushSub>("select id::text as id, endpoint, p256dh, auth from public.push_subscriptions where org_id = $1::uuid", [t.org_id])).rows;
    const payload = pushPayload({ task_id: taskId, kind, text: t.text, result: t.last_result, level: t.effective_level });
    for (const s of subs) {
      const r = await sendWebPush(s, payload, { vapid, ...(d.env ? { env: d.env } : {}), ...(d.resolve ? { resolve: d.resolve } : {}) });
      if (!r.ok && r.gone) await d.db.query("delete from public.push_subscriptions where id = $1::uuid", [s.id]);
      d.log?.(`[push] ${taskId} ${kind} → ${r.ok ? r.status : r.reason}`);
    }
  };
}
