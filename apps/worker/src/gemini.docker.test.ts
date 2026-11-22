import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ulid } from "@mandat/contract";
import { fakeGitHub } from "@mandat/gate-github";
import { ConnectionStore, loadKek, mintBootToken } from "@mandat/llm-proxy";
import { buildProxyRunArgs, dockerText } from "@mandat/sandbox";
import { buildFixture } from "./fixtures.js";
import { runDaemonOnce } from "./online/daemon.js";
import { pgliteDb } from "./online/pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./online/seed.js";
import { dockerEnv, repoRoot } from "./testing.js";

// E9в (D-430): a task with agent `gemini` runs the REAL Gemini CLI 0.65.0 in the sandbox. Its Gemini API calls go through
// the gate to a test proxy that holds the (fake) key of a saved Google Gemini connection, and on to a fake Gemini endpoint
// (the stub): the first turn asks for a shell command that fixes the shop's discount, then the CLI answers in text.
// The task ends with a verdict; the key never reaches the sandbox. No real key anywhere.
let env: Awaited<ReturnType<typeof dockerEnv>>;
const id = ulid().toLowerCase().slice(-10);
const stub = `mandat-test-stub-${id}` as const;
const proxy = `mandat-llm-proxy-test-${id}` as const;
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-gemini-"));
const KEY = ["AIza", randomBytes(26).toString("base64url")].join("");
const MODEL = "gemini-3.8-flash";
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
  const common = { image: env.images.proxy, user: env.user, mandatHome: home };
  expect((await dockerText(env.docker, buildProxyRunArgs({ ...common, name: stub, publishAdminPort: null, envNames: [], publicEnv: {}, command: ["node", "/opt/mandat/stub-upstream.mjs"] }))).exitCode).toBe(0);
  const publicEnv = { MANDAT_PROXY_SECRET_FILE: "/var/lib/mandat-proxy/secret", MANDAT_PROXY_ALLOW_INSECURE_UPSTREAM: "1" };
  const token = mintBootToken();
  const args = buildProxyRunArgs({ ...common, name: proxy, publishAdminPort: port, envNames: ["MANDAT_PROXY_BOOT_TOKEN"], publicEnv });
  expect((await env.docker.run(args, { env: { MANDAT_PROXY_BOOT_TOKEN: token }, stdin: "closed", timeoutMs: 60_000 })).exitCode).toBe(0);
  for (let i = 0; i < 100 && !(await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 200));
  // the saved connection, sealed like `mandat local` does; the proxy gets it once over the boot exchange
  const store = new ConnectionStore(home, loadKek({ env: {}, mandatHome: home }));
  store.put({ id: "gemini", provider: "gemini", label: "Google Gemini", baseUrl: null, models: [MODEL], defaultModel: MODEL }, KEY);
  const upstream = { ...store.upstreams().gemini, url: `http://${stub}:9000` };
  const b = await fetch(`http://127.0.0.1:${port}/admin/boot`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ upstreams: { gemini: upstream } }) });
  expect(b.status).toBe(204);
}, 180_000);
afterAll(async () => {
  await dockerText(env.docker, ["rm", "-f", stub, proxy]);
});

describe("Gemini CLI end to end with a fake Gemini endpoint (D-430, docker)", () => {
  it("gemini → conn-gemini → the real CLI in the sandbox → the gate → the proxy (the key) → the stub; the fix lands and gets a verdict", async () => {
    const fx = buildFixture({ repoRoot, mandatHome: home, force: true, name: "demo-shop" }); // a fresh base: the other test's verified fix may have moved main (D-367)
    const db = await pgliteDb();
    await seedMinimal(db, { remoteUrl: `file://${fx.mirror}` });
    await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text) values ('t_gemini', $1, $2, 'bugfix', 'gemini', 'Fix the discount threshold')", [DEMO_ORG_ID, DEMO_REPO_ID]);
    const gh = fakeGitHub({ repos: { "mandat-demo/shop": {} } });
    const lines: string[] = [];
    await runDaemonOnce({
      db, home, gh, ghRepo: "mandat-demo/shop", docker: env.docker, log: (l) => lines.push(l),
      runInternals: { env: { ...process.env, MANDAT_PROXY_ADMIN_PORT: String(port) }, llmProxyUrl: `http://${proxy}:8787`, infraUser: env.user, ipv6Sysctl: env.ipv6Sysctl },
    });
    const t = (await db.query<{ state: string; last_result: string | null; channel_kind: string | null }>("select state, last_result, channel_kind from public.tasks where id = 't_gemini'")).rows[0];
    const runs = path.join(home, "runs");
    const runDir = existsSync(runs) ? readdirSync(runs).map((r) => path.join(runs, r)).find((r) => existsSync(path.join(r, "transcript.jsonl"))) : undefined;
    const transcript = runDir ? readFileSync(path.join(runDir, "transcript.jsonl"), "utf8") : "";
    const proxyLog = (await dockerText(env.docker, ["logs", proxy])).stdout;
    const stubLog = (await dockerText(env.docker, ["logs", stub])).stdout;
    // the CLI ran, called the shell tool and finished; the proxy forwarded its Gemini calls with the connection's key
    expect({ result: t?.last_result, transcript: transcript.slice(0, 2000), stub: stubLog.slice(-1500), daemon: lines.slice(-8) }).toMatchObject({ result: "VERIFIED" });
    expect(transcript).toContain("run_shell_command");
    expect(stubLog).toContain(`gemini streamGenerateContent ${MODEL} tools=true answered=false`);
    expect(stubLog).toContain("answered=true");
    expect(proxyLog).toContain('"provider":"gemini"');
    expect(proxyLog).toContain('"upstream":"gemini"');
    expect(proxyLog).not.toContain(KEY);
    expect(transcript).not.toContain(KEY);
    expect(t?.channel_kind).toBe("api_key");
    await db.end();
  }, 600_000);
  it("with an approved harness profile: target gemini; --policy and --include-directories are accepted, nothing is skipped", async () => {
    const fx = buildFixture({ repoRoot, mandatHome: home, force: true, name: "demo-shop" }); // a fresh base: the other test's verified fix may have moved main (D-367)
    const db = await pgliteDb();
    await seedMinimal(db, { remoteUrl: `file://${fx.mirror}` });
    const { demoProfileLayers, sealProfile } = await import("@mandat/contract");
    const p = sealProfile({ version: 1, repo_id: DEMO_REPO_ID, layers: demoProfileLayers(), sources: {}, approved_by: null, approved_at: null });
    const r = await db.query<{ id: string }>("insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash, status, approved_at) values ($1, $2, 1, $3::jsonb, '{}', $4, 'approved', now()) returning id::text as id", [DEMO_ORG_ID, DEMO_REPO_ID, JSON.stringify(p.layers), p.profile_hash]);
    await db.query("update public.repos set profile_id = $2 where id = $1", [DEMO_REPO_ID, r.rows[0]?.id]);
    await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text) values ('t_gemini_p', $1, $2, 'bugfix', 'gemini', 'Fix the discount threshold')", [DEMO_ORG_ID, DEMO_REPO_ID]);
    const lines: string[] = [];
    await runDaemonOnce({
      db, home, gh: fakeGitHub({ repos: { "mandat-demo/shop": {} } }), ghRepo: "mandat-demo/shop", docker: env.docker, log: (l) => lines.push(l),
      runInternals: { env: { ...process.env, MANDAT_PROXY_ADMIN_PORT: String(port) }, llmProxyUrl: `http://${proxy}:8787`, infraUser: env.user, ipv6Sysctl: env.ipv6Sysctl },
    });
    const t = (await db.query<{ last_result: string | null }>("select last_result from public.tasks where id = 't_gemini_p'")).rows[0];
    const runs = readdirSync(path.join(home, "runs")).map((x) => path.join(home, "runs", x)).filter((x) => existsSync(path.join(x, "harness.json")));
    const harness = runs.map((x) => JSON.parse(readFileSync(path.join(x, "harness.json"), "utf8")) as { target: string; unsupported: { rule: string }[] });
    expect({ result: t?.last_result, daemon: lines.slice(-8) }).toMatchObject({ result: "VERIFIED" });
    expect(harness.map((h) => h.target)).toContain("gemini");
    expect(harness.find((h) => h.target === "gemini")?.unsupported.map((u) => u.rule)).toContain("hooks");
    // D-431: the CLI loaded every file the harness gave it (it warns and skips an insecure settings or policy path).
    // D-578: only that warning counts; "[STARTUP] Phase … never ended. Skipping metrics." is the CLI's own telemetry on a slow start.
    const gr = runs.find((x) => (JSON.parse(readFileSync(path.join(x, "harness.json"), "utf8")) as { target: string }).target === "gemini") ?? "";
    expect(readFileSync(path.join(gr, "agent-stderr.txt"), "utf8")).not.toMatch(/insecure|Skipping [^\n]*(settings|polic)/i);
    await db.end();
  }, 600_000);
});
