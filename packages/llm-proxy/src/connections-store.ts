import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Connection, KeyCheckState, ModelsBody, PROVIDERS, Preferences, Wire, keyHint, priceOf, upstreamUrl } from "@mandat/contract";
import type { ProxyUpstream } from "@mandat/contract";
import { FileKeyStore } from "./envelope.js";
import type { KeyProvider } from "./envelope.js";

// D-392: the saved connections of `mandat local`: metadata in $MANDAT_HOME/connections.json (0600), the key of each one
// sealed in keys.sealed.json (FileKeyStore, E7в). The Anthropic and OpenAI keys keep their old names ("anthropic",
// "openai"); every other key is conn:<id>. Without a KEK the store reads metadata only (the worker).
export type SavedConnection = Omit<Connection, "hasKey">;
interface FileShape { version: 1; connections: SavedConnection[]; preferences: Preferences }

// D-471: only the first key of Anthropic / OpenAI (id = the provider) keeps the old name; a second one is conn:<id>
const keyName = (c: { id: string; provider: string }): KeyProvider => ((c.provider === "anthropic" || c.provider === "openai") && c.id === c.provider ? c.provider : `conn:${c.id}`);

export class ConnectionStore {
  private readonly file: string;
  constructor(
    private readonly mandatHome: string,
    private readonly kek?: Buffer,
  ) {
    this.file = path.join(mandatHome, "connections.json");
  }
  private keys(): FileKeyStore {
    if (!this.kek) throw new Error("the connection keys need the KEK");
    return new FileKeyStore(this.mandatHome, this.kek);
  }
  /** The names in keys.sealed.json (no KEK needed: names only). */
  private sealedNames(): Set<string> {
    try {
      const v: unknown = JSON.parse(readFileSync(path.join(this.mandatHome, "keys.sealed.json"), "utf8"));
      return new Set(v !== null && typeof v === "object" ? Object.keys(v) : []);
    } catch {
      return new Set();
    }
  }
  private read(): FileShape {
    try {
      const v = JSON.parse(readFileSync(this.file, "utf8")) as Partial<FileShape>;
      const connections = (Array.isArray(v.connections) ? v.connections : []).flatMap((c) => {
        const p = Connection.safeParse({ ...c, hasKey: false });
        if (!p.success) return [];
        const { hasKey: _, ...rest } = p.data;
        return [rest];
      });
      const prefs = Preferences.safeParse(v.preferences ?? {});
      return { version: 1, connections, preferences: prefs.success ? prefs.data : Preferences.parse({}) };
    } catch {
      return { version: 1, connections: [], preferences: Preferences.parse({}) };
    }
  }
  private write(f: FileShape): void {
    mkdirSync(this.mandatHome, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(f, null, 2), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, this.file);
  }
  list(): Connection[] {
    const sealed = this.sealedNames();
    return this.read().connections.map((c) => ({ ...c, hasKey: sealed.has(keyName(c)) }));
  }
  get(id: string): Connection | null {
    return this.list().find((c) => c.id === id) ?? null;
  }
  /** Add or replace; the key (if any) is sealed first, so a failed write never leaves metadata without its key. */
  put(c: SavedConnection, key?: string): Connection {
    const f = this.read();
    const before = f.connections.find((x) => x.id === c.id);
    // D-471: a new key → its last four characters, and the old check no longer says anything; without one, both stay
    const { keyHint: _h, check: _c, ...meta } = c;
    const extra = key !== undefined ? { keyHint: keyHint(key) } : { ...(before?.keyHint ? { keyHint: before.keyHint } : {}), ...(before?.check ? { check: before.check } : {}) };
    const valid = Connection.parse({ ...meta, ...extra, hasKey: key !== undefined });
    if (key !== undefined) this.keys().put(keyName(valid), key);
    const { hasKey: _, ...saved } = valid;
    this.write({ ...f, connections: [...f.connections.filter((x) => x.id !== valid.id), saved] });
    return this.get(valid.id) as Connection;
  }
  setModels(id: string, m: ModelsBody): boolean {
    const b = ModelsBody.parse(m);
    const f = this.read();
    if (!f.connections.some((c) => c.id === id)) return false;
    this.write({ ...f, connections: f.connections.map((c) => (c.id === id ? { ...c, models: b.models, defaultModel: b.defaultModel } : c)) });
    return true;
  }
  /** D-472: the last "Check the key" of a saved connection. */
  setCheck(id: string, state: KeyCheckState): boolean {
    const st = KeyCheckState.parse(state);
    const f = this.read();
    if (!f.connections.some((c) => c.id === id)) return false;
    this.write({ ...f, connections: f.connections.map((c) => (c.id === id ? { ...c, check: st } : c)) });
    return true;
  }
  remove(id: string): void {
    const f = this.read();
    const c = f.connections.find((x) => x.id === id);
    if (!c) return;
    if (this.kek && this.sealedNames().has(keyName(c))) this.keys().delete(keyName(c));
    const prefs = f.preferences.defaultAgent?.endsWith(`+${id}`) || f.preferences.defaultAgent?.endsWith(`@${id}`) ? { ...f.preferences, defaultAgent: null, defaultModel: null } : f.preferences;
    this.write({ ...f, connections: f.connections.filter((x) => x.id !== id), preferences: prefs });
  }
  key(id: string): string | null {
    const c = this.read().connections.find((x) => x.id === id);
    return c ? this.keys().get(keyName(c)) : null;
  }
  prefs(): Preferences {
    return this.read().preferences;
  }
  setPrefs(p: Preferences): void {
    this.write({ ...this.read(), preferences: Preferences.parse(p) });
  }
  /** The proxy boot payload: every connection that goes through the proxy as its own upstream (not the provider keys). */
  upstreams(): Record<string, ProxyUpstream> {
    const out: Record<string, ProxyUpstream> = {};
    for (const c of this.read().connections) {
      const info = PROVIDERS[c.provider];
      // D-471: the first Anthropic / OpenAI key is the plain provider key; D-470: a format no agent speaks is not a wire
      if (info.kind === "subscription" || ((c.provider === "anthropic" || c.provider === "openai") && c.id === c.provider)) continue;
      const wire = Wire.safeParse(info.wire);
      if (!wire.success || info.auth === "aws" || info.auth === "gcp") continue;
      const u = upstreamUrl(c.baseUrl ?? info.baseUrl ?? "");
      const key = info.auth === "none" ? "" : this.keys().get(keyName(c));
      if (!u.ok || key === null) continue;
      const prices: ProxyUpstream["prices"] = {};
      for (const m of c.models) {
        const p = priceOf(c.provider, m);
        if (p) prices[m] = p;
      }
      out[c.id] = { wire: wire.data, url: u.url, auth: info.auth, key, models: [...c.models], prices, ...(info.kind === "local" ? { local: true } : {}) };
    }
    return out;
  }
}
