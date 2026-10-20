import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fakeGitHub } from "@mandat/gate-github";
import { buildProxyRunArgs, dockerText } from "@mandat/sandbox";
import type { DockerRunner } from "@mandat/sandbox";
import { buildFixture } from "../fixtures.js";
import { runDaemonOnce } from "./daemon.js";
import { offlineDb } from "./offline-db.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedChannels, seedMinimal } from "./seed.js";

// Демо промпт т. 8.3 „Готово, когато“ / сцена 2 offline: `mandat demo spill --fake`. stub-upstream answers 429
// (2 h) for Anthropic and the recorded Responses SSE for OpenAI; a test proxy in Docker; PGlite in the process;
// fake:limit-429 → spill → fake-codex:honest-fix. „демо: лимитът е симулиран“.
export interface SpillSummary { from: string; resetsInH: number | null; to: string; agent: string; attempt: number; result: string | null; level: number | null; ref: string | null; lines: string[] }

const freePort = () => new Promise<number>((resolve) => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => {
    const p = (s.address() as net.AddressInfo).port;
    s.close(() => resolve(p));
  });
});

export async function demoSpillFake(o: { repoRoot: string; home: string; docker: DockerRunner; images: { proxy: string }; user: string; ipv6Sysctl: boolean; limitSeconds?: number; replay?: string; env?: Record<string, string | undefined> }): Promise<SpillSummary> {
  const id = randomBytes(4).toString("hex");
  const stub = `mandat-test-stub-${id}` as const;
  const proxy = `mandat-llm-proxy-test-${id}` as const;
  const port = await freePort();
  mkdirSync(path.join(o.home, "proxy"), { recursive: true });
  writeFileSync(path.join(o.home, "proxy", "secret"), randomBytes(32), { mode: 0o600 });
  const common = { image: o.images.proxy, user: o.user, mandatHome: o.home, envNames: [] as string[] };
  const db = await offlineDb(o.repoRoot);
  try {
    if ((await dockerText(o.docker, buildProxyRunArgs({ ...common, name: stub, publishAdminPort: null, publicEnv: {}, command: ["node", "/opt/mandat/stub-upstream.mjs", "--429", String(o.limitSeconds ?? 7200)] }))).exitCode !== 0) throw new Error("stub did not start");
    const publicEnv = {
      MANDAT_PROXY_SECRET_FILE: "/var/lib/mandat-proxy/secret", MANDAT_UPSTREAM_ANTHROPIC: `http://${stub}:9000`, MANDAT_UPSTREAM_OPENAI: `http://${stub}:9000`,
      MANDAT_PROXY_ALLOW_INSECURE_UPSTREAM: "1", MANDAT_PROXY_OPENAI_PRICES: JSON.stringify({ "gpt-5-codex": { input: 1.25, cached_input: 0.125, output: 10 } }),
    };
    if ((await dockerText(o.docker, buildProxyRunArgs({ ...common, name: proxy, publishAdminPort: port, publicEnv }))).exitCode !== 0) throw new Error("test proxy did not start");
    for (let i = 0; i < 50 && !(await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.ok).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 200));
    const fx = buildFixture({ repoRoot: o.repoRoot, mandatHome: o.home, force: false, name: "demo-shop" });
    await seedMinimal(db, { remoteUrl: `file://${fx.mirror}` });
    await seedChannels(db);
    await db.query("update public.repos set ruleset_strict = true where id = $1", [DEMO_REPO_ID]);
    const task = `t_spill_${randomBytes(3).toString("hex")}`;
    await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, replay) values ($1, $2, $3, 'bugfix', 'fake:limit-429', 'Fix the discount threshold', $4)", [task, DEMO_ORG_ID, DEMO_REPO_ID, o.replay ?? null]);
    const gh = fakeGitHub({ repos: { "mandat-demo/shop": {} } });
    const lines: string[] = [];
    await runDaemonOnce({
      db, home: o.home, gh, ghRepo: "mandat-demo/shop", docker: o.docker, log: (l) => lines.push(l),
      runInternals: { env: { ...(o.env ?? process.env), MANDAT_PROXY_ADMIN_PORT: String(port) }, llmProxyUrl: `http://${proxy}:8787`, infraUser: o.user, ipv6Sysctl: o.ipv6Sysctl },
    });
    const t = (await db.query<{ attempt: number; agent: string; last_result: string | null; effective_level: number | null; label: string }>(
      "select t.attempt, t.agent, t.last_result, t.effective_level, c.label from public.tasks t left join public.model_channels c on c.id = t.channel_id where t.id = $1",
      [task],
    )).rows[0];
    const lim = (await db.query<{ resets: string | null }>("select to_char(limit_resets_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as resets from public.model_channels where label = 'anthropic-key-demo'")).rows[0];
    const ref = gh.state.calls.find((c) => c.startsWith("createRef"))?.match(/refs\/heads\/(\S+)/)?.[1] ?? null;
    return {
      from: "anthropic-key-demo", resetsInH: lim?.resets ? Math.round((Date.parse(lim.resets) - Date.now()) / 3_600_000) : null, to: t?.label ?? "?", agent: t?.agent ?? "?",
      attempt: t?.attempt ?? 0, result: t?.last_result ?? null, level: t?.effective_level ?? null, ref, lines,
    };
  } finally {
    await dockerText(o.docker, ["rm", "-f", stub, proxy]);
    await db.end();
  }
}

export function spillLine(s: SpillSummary): string {
  if (s.attempt < 2) return `no spill: ${s.from} · attempt ${s.attempt} · ${s.result ?? "—"} (see the [daemon] lines above)`;
  const agent = s.agent.startsWith("fake-codex:") || s.agent === "codex" ? "codex" : s.agent;
  return `${s.from} 429 (resets in ${s.resetsInH ?? "?"}h) → spill → ${s.to} · agent ${agent} · attempt ${s.attempt} · ${s.result ?? "—"} · ниво ${s.level ?? "?"} → клон ${s.ref ?? "—"}`;
}
