import { AddConnectionBody, ModelId, ModelsBody, PROVIDERS, Preferences, upstreamUrl } from "@mandat/contract";
import type { AddConnectionReply, Connection, ConnectionsReply, DetectReply, ProviderId, Wire } from "@mandat/contract";
import type { ConnectionStore } from "@mandat/llm-proxy";

// D-393: the saved connections of `mandat local` behind the control endpoint (first-run page, Settings → Models). A key is
// checked once from this computer against the provider, then sealed (ConnectionStore) and handed to the proxy on restart.
// Nothing here logs, stores elsewhere or returns a key.

const TIMEOUT = 10_000;
type Fetch = typeof fetch;
const authHeaders = (auth: "x-api-key" | "bearer" | "none", key: string, wire: Wire): Record<string, string> => ({
  ...(wire === "anthropic" ? { "anthropic-version": "2023-06-01" } : {}),
  ...(auth === "x-api-key" ? { "x-api-key": key } : auth === "bearer" ? { authorization: `Bearer ${key}` } : {}),
});

/** ok | bad_key (401/403) | unreachable. A list call first; without a list endpoint, one 1-token message decides. */
export async function checkKey(f: Fetch, o: { wire: Wire; base: string; auth: "x-api-key" | "bearer" | "none"; key: string; model: string }): Promise<"ok" | "bad_key" | "unreachable"> {
  const base = o.base.replace(/\/+$/, "");
  const headers = authHeaders(o.auth, o.key, o.wire);
  const verdict = (s: number) => (s === 401 || s === 403 ? "bad_key" : "ok");
  try {
    const list = await f(`${base}/v1/models`, { method: "GET", headers, signal: AbortSignal.timeout(TIMEOUT) });
    if (o.auth === "none" || (list.status !== 404 && list.status !== 405)) return verdict(list.status);
    if (o.wire === "openai") return "ok";
    const msg = await f(`${base}/v1/messages`, {
      method: "POST", headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ model: o.model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }), signal: AbortSignal.timeout(TIMEOUT),
    });
    return verdict(msg.status);
  } catch {
    return "unreachable";
  }
}

/** Ollama (/api/tags) and LM Studio (/v1/models) on this computer; a server that does not answer is left out. */
export async function detectLocal(f: Fetch): Promise<DetectReply["local"]> {
  const probe = async (url: string, pick: (j: unknown) => unknown[]): Promise<string[] | null> => {
    try {
      const r = await f(url, { signal: AbortSignal.timeout(1500) });
      if (!r.ok) return null;
      return pick(await r.json()).map((x) => String(x)).filter((m) => ModelId.safeParse(m).success).slice(0, 100);
    } catch {
      return null;
    }
  };
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const [ollama, lmstudio] = await Promise.all([
    probe("http://127.0.0.1:11434/api/tags", (j) => arr((j as { models?: unknown }).models).map((m) => (m as { name?: unknown }).name)),
    probe("http://127.0.0.1:1234/v1/models", (j) => arr((j as { data?: unknown }).data).map((m) => (m as { id?: unknown }).id)),
  ]);
  return [...(ollama ? [{ provider: "ollama" as const, models: ollama }] : []), ...(lmstudio ? [{ provider: "lmstudio" as const, models: lmstudio }] : [])];
}

const recommended = (p: ProviderId, models: readonly string[]): string => PROVIDERS[p].models.find((m) => m.recommended && models.includes(m.id))?.id ?? (models[0] as string);

export interface ConnectionsDeps {
  store: ConnectionStore;
  fetch: Fetch;
  /** recreates the proxy with every saved key and connection; false = it did not come up */
  restartProxy(): Promise<boolean>;
  /** the subscription accounts (profile volumes) */
  accounts(): Promise<{ name: string; cli: "claude" | "codex" }[]>;
}

export class Connections {
  constructor(private readonly d: ConnectionsDeps) {}

  /** The saved connections, plus each subscription account not saved yet (its catalog models, so they can be edited). */
  async list(): Promise<ConnectionsReply> {
    const saved = this.d.store.list();
    const extra: Connection[] = (await this.d.accounts().catch(() => []))
      .filter((a) => !saved.some((c) => c.id === a.name))
      .map((a) => {
        const provider = a.cli === "codex" ? "chatgpt-sub" : "claude-sub";
        const models = PROVIDERS[provider].models.map((m) => m.id);
        return { id: a.name, provider, label: a.name, baseUrl: null, models, defaultModel: recommended(provider, models), hasKey: false };
      });
    return { connections: [...saved, ...extra], preferences: this.d.store.prefs() };
  }

  async add(raw: unknown): Promise<AddConnectionReply> {
    const b = AddConnectionBody.safeParse(raw);
    if (!b.success) return { ok: false, error: "bad_address" };
    const info = PROVIDERS[b.data.provider];
    const id = b.data.provider === "anthropic" || b.data.provider === "openai" ? b.data.provider : (b.data.id ?? b.data.provider);
    const baseUrl = b.data.baseUrl ?? info.baseUrl;
    if (baseUrl === null || !upstreamUrl(baseUrl).ok) return { ok: false, error: "bad_address" };
    const defaultModel = b.data.defaultModel ?? recommended(b.data.provider, b.data.models);
    const check = await checkKey(this.d.fetch, { wire: info.wire, base: baseUrl, auth: b.data.key === undefined ? "none" : info.auth, key: b.data.key ?? "", model: defaultModel });
    if (check !== "ok") return { ok: false, error: check };
    let connection: Connection;
    try {
      connection = this.d.store.put({ id, provider: b.data.provider, label: b.data.label ?? info.label, baseUrl, models: b.data.models, defaultModel }, b.data.key);
    } catch {
      return { ok: false, error: "failed" };
    }
    return (await this.d.restartProxy()) ? { ok: true, connection } : { ok: false, error: "proxy_start_failed" };
  }

  /** Settings → Models: a saved connection, or a subscription account seen for the first time (saved now). */
  async setModels(id: string, raw: unknown): Promise<boolean> {
    const b = ModelsBody.safeParse(raw);
    if (!b.success) return false;
    if (this.d.store.setModels(id, b.data)) {
      if (this.d.store.get(id)?.provider !== "claude-sub" && this.d.store.get(id)?.provider !== "chatgpt-sub") await this.d.restartProxy();
      return true;
    }
    const acct = (await this.d.accounts().catch(() => [])).find((a) => a.name === id);
    if (!acct) return false;
    const provider = acct.cli === "codex" ? "chatgpt-sub" : "claude-sub";
    this.d.store.put({ id, provider, label: id, baseUrl: null, models: b.data.models, defaultModel: b.data.defaultModel });
    return true;
  }

  async remove(id: string): Promise<boolean> {
    if (this.d.store.get(id) === null) return false;
    this.d.store.remove(id);
    await this.d.restartProxy();
    return true;
  }

  async detect(env: Record<string, string | undefined>): Promise<DetectReply> {
    const envKeys = (["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY"] as const).filter((k) => (env[k] ?? "") !== "");
    return { local: await detectLocal(this.d.fetch), envKeys };
  }

  setPrefs(raw: unknown): boolean {
    const p = Preferences.safeParse(raw);
    if (!p.success) return false;
    this.d.store.setPrefs(p.data);
    return true;
  }
}
