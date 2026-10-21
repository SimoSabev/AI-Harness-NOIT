import { z } from "zod";

// D-293: the web server forwards API keys to the control endpoint of `mandat local` (127.0.0.1 + bearer token), which
// starts the proxy with them. The web server keeps nothing: no database row, no file, no log, no echo.
export const KeysBody = z.object({
  anthropic: z.string().trim().regex(/^[\x21-\x7e]{20,512}$/),
  openai: z.string().trim().regex(/^([\x21-\x7e]{20,512})?$/).optional(),
}).strict();

export interface KeysStatus { proxy: "running" | "stopped" | "unavailable"; providers: string[] }
export interface KeysClient {
  status(): Promise<KeysStatus>;
  set(k: { anthropic: string; openai?: string }): Promise<KeysStatus | null>;
  clear(): Promise<KeysStatus>;
}

const Status = z.object({ proxy: z.enum(["running", "stopped"]), providers: z.array(z.enum(["anthropic", "openai"])) });

export function controlKeys(env: Record<string, string | undefined>): KeysClient | null {
  const url = env.MANDAT_LOCAL_CONTROL_URL;
  const token = env.MANDAT_LOCAL_CONTROL_TOKEN;
  if (!url || !token || !/^http:\/\/127\.0\.0\.1:\d+$/.test(url)) return null;
  const call = async (method: string, body?: unknown): Promise<KeysStatus | null> => {
    const r = await fetch(`${url}/keys`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(90_000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const s = Status.safeParse(await r.json().catch(() => null));
    return s.success ? s.data : null;
  };
  const down: KeysStatus = { proxy: "unavailable", providers: [] };
  return {
    status: async () => (await call("GET").catch(() => null)) ?? down,
    set: (k) => call("POST", k).catch(() => null),
    clear: async () => (await call("DELETE").catch(() => null)) ?? down,
  };
}
