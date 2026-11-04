import { ApiKey, PROVIDERS, providerGroups } from "@mandat/contract";
import type { AddConnectionBody, KeyCli, Connection, KeyCheck, ProviderGroup, ProviderId } from "@mandat/contract";
import type { Key } from "../../../i18n/t";

// D-475: the pure part of the API keys section (Settings → API keys): the rows a person sees and the body of "Add a key".
// A row has the last four characters of its key at most; the full key exists only in the add form until it is sent.

export interface KeyRow {
  id: string;
  label: string;
  /** the provider's product name */
  provider: string;
  hint: string | null;
  status: KeyCheck | null;
  /** which CLI can use this key; null = none here yet (shown honestly) */
  agent: KeyCli | null;
  models: string[];
  defaultModel: string;
  live: boolean;
  docs: string;
}

export function keyRows(connections: readonly Connection[]): KeyRow[] {
  return connections.flatMap((c) => {
    const info = PROVIDERS[c.provider];
    if (info.kind !== "api_key") return [];
    return [{ id: c.id, label: c.label, provider: info.label, hint: c.keyHint ?? null, status: c.check?.status ?? null, agent: info.agent, models: [...c.models], defaultModel: c.defaultModel, live: info.live, docs: info.docs }];
  });
}

type Tone = "green" | "amber" | "red" | "gray";
const STATUS: Record<KeyCheck, { tone: Tone; label: Key }> = {
  ok: { tone: "green", label: "apikeys.status.ok" },
  bad_key: { tone: "red", label: "apikeys.status.bad_key" },
  no_credit: { tone: "amber", label: "apikeys.status.no_credit" },
  unreachable: { tone: "gray", label: "apikeys.status.unreachable" },
};
export const statusOf = (s: KeyCheck | null): { tone: Tone; label: Key } => (s === null ? { tone: "gray", label: "apikeys.status.unchecked" } : STATUS[s]);

/** The providers the add form offers, by group: key-taking ones that a person can paste a key for. */
export function keyProviderGroups(): { group: ProviderGroup; ids: ProviderId[] }[] {
  return providerGroups()
    .map((g) => ({ group: g.group, ids: g.ids.filter((id) => PROVIDERS[id].kind === "api_key" && PROVIDERS[id].auth !== "aws" && PROVIDERS[id].auth !== "gcp") }))
    .filter((g) => g.ids.length > 0);
}

export interface AddKeyForm { provider: ProviderId; label: string; key: string; baseUrl: string; models?: string[]; defaultModel?: string }

/** The POST /api/connections body; null = nothing to send yet (no model for a provider without suggestions). */
/** The key's shape as the contract takes it (20–512 visible characters, no spaces) — checked before sending, so a short or
 * broken key is named as such instead of coming back as a refused body. */
export function keyLooksRight(key: string): boolean {
  return ApiKey.safeParse(key).success;
}

export function addKeyBody(f: AddKeyForm): AddConnectionBody | null {
  const info = PROVIDERS[f.provider];
  const rec = info.models.filter((m) => m.recommended).map((m) => m.id);
  const models = f.models && f.models.length > 0 ? f.models : rec.length > 0 ? rec : info.models.slice(0, 1).map((m) => m.id);
  if (models.length === 0) return null;
  const defaultModel = f.defaultModel !== undefined && models.includes(f.defaultModel) ? f.defaultModel : (models[0] as string);
  const baseUrl = f.baseUrl.trim();
  const key = f.key.trim();
  return {
    provider: f.provider as AddConnectionBody["provider"],
    ...(f.label.trim() ? { label: f.label.trim() } : {}),
    ...(key ? { key } : {}),
    ...(info.baseUrl === null || (baseUrl !== "" && baseUrl !== info.baseUrl) ? { baseUrl } : {}),
    models,
    defaultModel,
  };
}
