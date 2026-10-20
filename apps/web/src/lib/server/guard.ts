import { timingSafeEqual } from "node:crypto";

// Спец. т. 12 / демо промпт т. 8.1: Origin check + CSRF (double submit) + body ≤ 1 MB + rate limit for the internal API.
export const MAX_BODY = 1024 * 1024;
export const CSRF_COOKIE = "mandat_csrf";
export const CSRF_HEADER = "x-mandat-csrf";

export function cookieValue(req: Request, name: string): string | null {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** The request's Origin must be our own origin (MANDAT_WEB_ORIGIN, else http(s)://<Host>). */
export function checkOrigin(req: Request, configured: string | undefined = process.env.MANDAT_WEB_ORIGIN): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  if (configured) return origin === configured.replace(/\/+$/, "");
  const host = req.headers.get("host");
  return host !== null && (origin === `http://${host}` || origin === `https://${host}`);
}

export function checkCsrf(req: Request): boolean {
  const c = cookieValue(req, CSRF_COOKIE);
  const h = req.headers.get(CSRF_HEADER);
  if (!c || !h || c.length < 32 || c.length !== h.length) return false;
  return timingSafeEqual(Buffer.from(c), Buffer.from(h));
}

export async function readJsonBody(req: Request): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY) return { ok: false, status: 413 };
  if (!req.body) return { ok: true, value: {} };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400 };
  }
}

/** Sliding window per key (in-process; one web instance in the demo). */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}
  take(key: string): boolean {
    const t = this.now();
    const list = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (list.length >= this.max) {
      this.hits.set(key, list);
      return false;
    }
    list.push(t);
    this.hits.set(key, list);
    return true;
  }
}
