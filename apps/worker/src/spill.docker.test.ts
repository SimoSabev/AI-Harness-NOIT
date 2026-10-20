import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeGitHub } from "@mandat/gate-github";
import { readLedgerOnline } from "@mandat/ledger";
import { buildProxyRunArgs, dockerText } from "@mandat/sandbox";
import { buildFixture } from "./fixtures.js";
import { DEMO_CHANNELS, DEMO_ORG_ID, DEMO_REPO_ID, seedChannels, seedMinimal } from "./online/seed.js";
import { runDaemonOnce } from "./online/daemon.js";
import { pgliteDb } from "./online/pglite-db.test-helper.js";
import { dockerEnv, repoRoot } from "./testing.js";

// Демо промпт т. 8.3 spill.docker.test: stub 429 на Anthropic → fake-codex:honest-fix → VERIFIED; tasks.agent=codex
// (fake), attempt 2, ledger channel_spill, ниво 0, изходът е branch_only. Real sandbox + gate + test proxy + stub.
let env: Awaited<ReturnType<typeof dockerEnv>>;
const id = randomBytes(4).toString("hex");
const stub = `mandat-test-stub-${id}` as const;
const proxy = `mandat-llm-proxy-test-${id}` as const;
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-spill-"));
let port = 0;

const freePort = () => new Promise<number>((resolve) => {
  const s = net.createServer();
  s.listen(0, "127.0.0.1", () => {
    const p = (s.address() as net.AddressInfo).port;
    s.close(() => resolve(p));
  });
});

beforeAll(async () => {
  env = await dockerEnv();
  port = await freePort();
  mkdirSync(path.join(home, "proxy"), { recursive: true });
  writeFileSync(path.join(home, "proxy", "secret"), randomBytes(32), { mode: 0o600 });
  const common = { image: env.images.proxy, user: env.user, mandatHome: home, envNames: [] as string[] };
  expect((await dockerText(env.docker, buildProxyRunArgs({ ...common, name: stub, publishAdminPort: null, publicEnv: {}, command: ["node", "/opt/mandat/stub-upstream.mjs", "--429", "7200"] }))).exitCode).toBe(0);
  const publicEnv = {
    MANDAT_PROXY_SECRET_FILE: "/var/lib/mandat-proxy/secret", MANDAT_UPSTREAM_ANTHROPIC: `http://${stub}:9000`, MANDAT_UPSTREAM_OPENAI: `http://${stub}:9000`,
    MANDAT_PROXY_ALLOW_INSECURE_UPSTREAM: "1", MANDAT_PROXY_OPENAI_PRICES: JSON.stringify({ "gpt-5-codex": { input: 1.25, cached_input: 0.125, output: 10 } }),
  };
  expect((await dockerText(env.docker, buildProxyRunArgs({ ...common, name: proxy, publishAdminPort: port, publicEnv }))).exitCode).toBe(0);
  for (let i = 0; i < 50; i++) {
    const ok = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.ok).catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 200));
  }
});
afterAll(async () => {
  await dockerText(env.docker, ["rm", "-f", stub, proxy]);
});

describe("spill (docker)", () => {
  it("anthropic-key-demo 429 (2 ч) → spill → openai-key-demo · fake-codex:honest-fix · опит 2 · VERIFIED · ниво 0 → клон …-a2", async () => {
    const fx = buildFixture({ repoRoot, mandatHome: home, force: false, name: "demo-shop" });
    const db = await pgliteDb();
    await seedMinimal(db, { remoteUrl: `file://${fx.mirror}` });
    await seedChannels(db);
    await db.query("update public.repos set ruleset_strict = true where id = $1", [DEMO_REPO_ID]);
    await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text) values ('t_spill', $1, $2, 'bugfix', 'fake:limit-429', 'Fix the discount')", [DEMO_ORG_ID, DEMO_REPO_ID]);
    const gh = fakeGitHub({ repos: { "mandat-demo/shop": {} } });
    const lines: string[] = [];
    await runDaemonOnce({
      db, home, gh, ghRepo: "mandat-demo/shop", docker: env.docker, log: (l) => lines.push(l),
      runInternals: { env: { ...process.env, MANDAT_PROXY_ADMIN_PORT: String(port) }, llmProxyUrl: `http://${proxy}:8787`, infraUser: env.user, ipv6Sysctl: env.ipv6Sysctl },
    });
    const t = (await db.query<{ state: string; attempt: number; agent: string; last_result: string; effective_level: number; channel_id: string }>("select state, attempt, agent, last_result, effective_level, channel_id::text as channel_id from public.tasks where id = 't_spill'")).rows[0];
    expect(t).toMatchObject({ attempt: 2, agent: "fake-codex:honest-fix", last_result: "VERIFIED", effective_level: 0, channel_id: DEMO_CHANNELS.openai });
    const kinds = (await readLedgerOnline(db, DEMO_ORG_ID)).map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(["channel_limit", "channel_spill", "verdict"]));
    expect(gh.state.calls.some((c) => c.startsWith("createRef") && c.includes("mandat/t_spill-a2"))).toBe(true);
    expect(gh.state.calls.some((c) => c.startsWith("createPull"))).toBe(false);
    expect(lines.join("\n")).toContain("anthropic-key-demo 429 → spill → openai-key-demo · agent fake-codex:honest-fix · attempt 2");
    await db.end();
  });
});
