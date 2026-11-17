import { AddConnectionBody, ModelId, ModelsBody, PROVIDERS, Preferences, SUBSCRIPTIONS, nextConnectionId, upstreamUrl } from "@mandat/contract";
import type { AddConnectionReply, CheckKeyReply, Connection, ConnectionsReply, DetectReply, ProviderId, SubscriptionId } from "@mandat/contract";
import { checkKey } from "@mandat/llm-proxy";
import type { ConnectionStore } from "@mandat/llm-proxy";

// D-393: the saved connections of `mandat local` behind the control endpoint (first-run page, Settings → Models). A key is
// checked once from this computer against the provider, then sealed (ConnectionStore) and handed to the proxy on restart.
// Nothing here logs, stores elsewhere or returns a key.

type Fetch = typeof fetch;
// D-472: the key check lives in @mandat/llm-proxy (one 1-token request in the provider's format, four results)
export { checkKey };

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
  accounts(): Promise<{ name: string; cli: SubscriptionId }[]>;
  now?: () => Date;
}

export class Connections {
  constructor(private readonly d: ConnectionsDeps) {}

  /** The saved connections, plus each subscription account not saved yet (its catalog models, so they can be edited). */
  async list(): Promise<ConnectionsReply> {
    const saved = this.d.store.list();
    const extra: Connection[] = (await this.d.accounts().catch(() => []))
      .filter((a) => !saved.some((c) => c.id === a.name) && SUBSCRIPTIONS[a.cli].connectionProvider !== null)
      .map((a) => {
        // D-460: the models of a subscription come from its registry entry's catalog provider
        const provider = SUBSCRIPTIONS[a.cli].connectionProvider ?? "claude-sub";
        const models = PROVIDERS[provider].models.map((m) => m.id);
        return { id: a.name, provider, label: a.name, baseUrl: null, models, defaultModel: recommended(provider, models), hasKey: false };
      });
    return { connections: [...saved, ...extra], preferences: this.d.store.prefs() };
  }

  async add(raw: unknown): Promise<AddConnectionReply> {
    const b = AddConnectionBody.safeParse(raw);
    if (!b.success) return { ok: false, error: "bad_address" };
    const info = PROVIDERS[b.data.provider];
    // D-471: several keys per provider — a given id replaces that connection; without one, the next free id
    const id = b.data.id ?? nextConnectionId(b.data.provider, this.d.store.list().map((c) => c.id));
    const baseUrl = b.data.baseUrl ?? info.baseUrl;
    if (baseUrl === null || !upstreamUrl(baseUrl).ok) return { ok: false, error: "bad_address" };
    const defaultModel = b.data.defaultModel ?? recommended(b.data.provider, b.data.models);
    const check = await checkKey(this.d.fetch, { wire: info.wire, base: baseUrl, auth: b.data.key === undefined ? "none" : info.auth, key: b.data.key ?? "", model: defaultModel });
    // D-472: a refused key or a silent server is not saved; a key without credit is (it works once topped up)
    if (check === "bad_key" || check === "unreachable") return { ok: false, error: check };
    let connection: Connection;
    try {
      this.d.store.put({ id, provider: b.data.provider, label: b.data.label ?? info.label, baseUrl, models: b.data.models, defaultModel }, b.data.key);
      this.d.store.setCheck(id, { status: check, at: this.at() });
      connection = this.d.store.get(id) as Connection;
    } catch {
      return { ok: false, error: "failed" };
    }
    return (await this.d.restartProxy()) ? { ok: true, connection } : { ok: false, error: "proxy_start_failed" };
  }

  private at(): string {
    return (this.d.now?.() ?? new Date()).toISOString();
  }

  /** D-472: "Check the key" of a saved connection — one cheap request, the result kept for the page; null = unknown id. */
  async check(id: string): Promise<CheckKeyReply | null> {
    const c = this.d.store.get(id);
    if (c === null) return null;
    const info = PROVIDERS[c.provider];
    if (info.kind === "subscription") return null;
    const base = c.baseUrl ?? info.baseUrl;
    let key = "";
    if (info.auth !== "none") {
      try {
        key = this.d.store.key(id) ?? "";
      } catch {
        key = "";
      }
      if (key === "") return { status: "bad_key", at: this.at() };
    }
    const status = base === null ? "unreachable" : await checkKey(this.d.fetch, { wire: info.wire, base, auth: info.auth, key, model: c.defaultModel });
    const state = { status, at: this.at() } as const;
    this.d.store.setCheck(id, state);
    return state;
  }

  /** Settings → Models: a saved connection, or a subscription account seen for the first time (saved now). */
  async setModels(id: string, raw: unknown): Promise<boolean> {
    const b = ModelsBody.safeParse(raw);
    if (!b.success) return false;
    if (this.d.store.setModels(id, b.data)) {
      if (PROVIDERS[this.d.store.get(id)?.provider ?? "custom"].kind !== "subscription") await this.d.restartProxy();
      return true;
    }
    const acct = (await this.d.accounts().catch(() => [])).find((a) => a.name === id);
    const provider = acct ? SUBSCRIPTIONS[acct.cli].connectionProvider : null;
    if (provider === null) return false;
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
    // D-531: the keys sent change, the others keep their saved value
    const p = Preferences.safeParse(raw !== null && typeof raw === "object" && !Array.isArray(raw) ? { ...this.d.store.prefs(), ...raw } : raw);
    if (!p.success) return false;
    this.d.store.setPrefs(p.data);
    return true;
  }
}
