import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { depthBudget } from "@mandat/contract";
import type { ResearchRequest } from "@mandat/contract";
import { mintTaskToken } from "@mandat/llm-proxy";
import type { SqlClient } from "@mandat/ledger";
import { Fetcher, anthropicViaProxy, anthropicWebSearch, arxiv, cliModel, crossref, fakeModel, github, localModel, proxyModel, searxng, stackexchange, wikipedia } from "@mandat/research";
import type { CliExec, ModelClient, Renderer, RouterChannel, SearchProvider } from "@mandat/research";
import { loadChannels } from "./channels.js";
import type { ResearchEnv } from "./research.js";

// E9г (D-398): the research environment on this computer. Models: every enabled channel of the org — an API key through
// llm-proxy with a run-scoped mdt_ token (budget = the run's cap; the key never leaves the proxy, AGENTS.md rule 2), a
// subscription profile through the unchanged CLI in its sandbox (D-295), a local OpenAI-compatible server. Search: our
// own (SearXNG when running, Wikipedia, arXiv, Crossref, GitHub, Stack Exchange) plus Anthropic web search when an
// Anthropic key is connected. Pages: the fetch ladder with the browser tier when the image is there.

export interface HostResearchOptions {
  db: SqlClient;
  env: Record<string, string | undefined>;
  /** the proxy's inference port on loopback and its secret (null = no proxy: API-key channels are left out) */
  proxy: { url: string; secretPath: string } | null;
  /** a subscription profile's CLI call in its sandbox (null = not available on this host) */
  profileExec: ((profile: string, argv: string[], stdin: string, signal?: AbortSignal) => Promise<string>) | null;
  renderer?: Renderer | null;
  now?: () => number;
}

export const DEFAULT_SEARXNG = "http://127.0.0.1:8888";
export const DEFAULT_LOCAL_MODEL = "http://127.0.0.1:11434/v1";

async function reachable(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return r.status < 500;
  } catch {
    return false;
  }
}

export async function hostResearchEnv(o: HostResearchOptions, org: string, req: ResearchRequest, questionId: string): Promise<ResearchEnv> {
  const now = o.now ?? Date.now;
  const states = await loadChannels(o.db, org);
  const cap = { ...depthBudget(req.depth), ...(req.budget_usd !== null ? { usd: req.budget_usd } : {}) };
  const secret = o.proxy ? readFileSync(o.proxy.secretPath) : null;
  const token = (provider: "anthropic" | "openai", n: number) =>
    mintTaskToken(secret as Buffer, { t: questionId, r: `${questionId}_${n}`, a: 1, e: Math.floor(now() / 1000) + (cap.minutes + 5) * 60, b: cap.usd, n: randomBytes(8).toString("hex"), ...(provider === "openai" ? { p: "openai" as const } : {}) });
  const channels: RouterChannel[] = [];
  const clients = new Map<string, ModelClient>();
  states.forEach((c, i) => {
    const ch: RouterChannel = { id: c.id, label: c.label, kind: c.kind, model: c.model, enabled: c.enabled, health: c.health, quality: c.quality, cost: c.cost };
    if (c.kind === "api_key") {
      if (!o.proxy) return;
      clients.set(c.id, proxyModel({ channel: ch, baseUrl: o.proxy.url, token: token(c.provider, i), provider: c.provider }));
    } else if (c.kind === "cli_profile") {
      const profile = /^claude-profile-([a-z0-9][a-z0-9-]{0,31})$/.exec(c.label)?.[1];
      if (!profile || !o.profileExec) return;
      const run = o.profileExec;
      const exec: CliExec = (argv, stdin, signal) => run(profile, argv, stdin, signal);
      clients.set(c.id, cliModel({ channel: ch, exec }));
    } else {
      clients.set(c.id, localModel({ channel: ch, baseUrl: o.env.MANDAT_LOCAL_MODEL_URL ?? DEFAULT_LOCAL_MODEL }));
    }
    channels.push(ch);
  });
  const providers: SearchProvider[] = [wikipedia(), arxiv(), github(), stackexchange()];
  if (o.env.MANDAT_RESEARCH_MAILTO) providers.push(crossref({ mailto: o.env.MANDAT_RESEARCH_MAILTO }));
  const sx = o.env.MANDAT_SEARXNG_URL ?? DEFAULT_SEARXNG;
  if (await reachable(`${sx}/healthz`)) providers.unshift(searxng({ baseUrl: sx }));
  const anthropicKey = states.find((c) => c.kind === "api_key" && c.provider === "anthropic" && c.enabled && c.health === "ok");
  if (anthropicKey && o.proxy) providers.push(anthropicWebSearch({ client: anthropicViaProxy(o.proxy.url, token("anthropic", states.length + 1)), model: "claude-haiku-5-5" }));
  return {
    channels,
    clientOf: (c) => clients.get(c.id) ?? fakeModel(c, () => "{}"),
    providers,
    fetcher: new Fetcher({ respectRobots: req.respect_robots, renderer: o.renderer ?? null }),
  };
}
