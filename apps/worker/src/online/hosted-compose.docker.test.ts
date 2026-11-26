import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { request } from "node:https";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashJcs } from "@mandat/contract";
import { appendLedgerOnline } from "@mandat/ledger";
import { imageTags } from "@mandat/sandbox";
import { repoRoot } from "../testing.js";
import { openDb } from "./db.js";
import type { Db } from "./db.js";
import { drainOutbox } from "./outbox.js";
import { HttpOutbox, RunnerClient } from "./runner-client.js";
import type { FetchLike } from "./runner-client.js";

// E10 hosted (v5 т. 6.1, D-700–D-705): the "Готово" of the hosted part, against the REAL compose stack on this computer
// (deploy/docker-compose.core.yml + docker-compose.local.yml): Caddy with TLS → the worker's hosted port → the user's
// Postgres with every migration. Two teams; team A has an owner (Ana), a worker (Boris) and a viewer (Vera) on one
// project; team B (Cveta) sees nothing of A. A runner of team A drains the project's effects through HTTPS only, and the
// audit export of the task passes `verify-log --audit`. MANDAT_KEEP_STACK=1 leaves the stack up for a look.

const PROJECT = `mandat-e10-it-${process.pid}`;
const FILES = ["-f", path.join(repoRoot, "deploy/docker-compose.core.yml"), "-f", path.join(repoRoot, "deploy/docker-compose.local.yml")];
const A = "a0000000-0000-4000-8000-00000000000a";
const B = "b0000000-0000-4000-8000-00000000000b";
const U = { ana: "a1000000-0000-4000-8000-000000000001", boris: "a1000000-0000-4000-8000-000000000002", vera: "a1000000-0000-4000-8000-000000000003", cveta: "b1000000-0000-4000-8000-000000000001" };
const REPO_A = "a2000000-0000-4000-8000-000000000001";
const TASK = "t_e10_team_a";

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as AddressInfo).port;
      s.close(() => resolve(p));
    });
  });

let env: NodeJS.ProcessEnv;
let db: Db;
let https: FetchLike;
let base = "";
const compose = (...a: string[]) => spawnSync("docker", ["compose", "-p", PROJECT, ...FILES, ...a], { env, encoding: "utf8", timeout: 900_000 });
const cli = (...a: string[]) => spawnSync(process.execPath, [path.join(repoRoot, "packages/cli/dist/main.js"), ...a], { env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", MANDAT_DB_URL: env.MANDAT_DB_URL ?? "" }, encoding: "utf8", cwd: out });
const out = mkdtempSync(path.join(tmpdir(), "mandat-e10-"));

/** as the web does it (apps/web sql.ts asUser): role authenticated + the user's claims, in one transaction */
async function asUser<T>(uid: string, q: string, p: unknown[] = []): Promise<T[]> {
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    const r = await c.query<T>(q, p);
    await c.query("commit");
    return r.rows;
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}
const pgErr = (e: unknown): string => (typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "?");

beforeAll(async () => {
  const [httpsPort, pgPort] = [await freePort(), await freePort()];
  const pw = randomBytes(18).toString("hex");
  env = {
    ...process.env,
    MANDAT_DOMAIN: "localhost",
    MANDAT_LOCAL_HTTPS_PORT: String(httpsPort),
    MANDAT_LOCAL_PG_PORT: String(pgPort),
    MANDAT_LOCAL_PG_PASSWORD: pw,
    MANDAT_DB_URL: `postgresql://postgres:${pw}@postgres:5432/mandat`,
    MANDAT_RUNNER_JWT_SECRET: randomBytes(32).toString("hex"),
    MANDAT_SEARXNG_SECRET: randomBytes(24).toString("hex"),
    MANDAT_ROOTLESS_DOCKER_SOCK: "/dev/null", // replaced by the local overlay (no Docker socket in role api)
    MANDAT_LLM_PROXY_IMAGE: (await imageTags(repoRoot)).proxy,
    // the proxy needs a value to start; it is never a real key and never leaves the proxy container (rule 2)
    ANTHROPIC_API_KEY: "placeholder-not-a-key",
  };
  if (spawnSync("docker", ["image", "inspect", env.MANDAT_LLM_PROXY_IMAGE ?? ""]).status !== 0) {
    const b = spawnSync("docker", ["build", "-q", "-t", env.MANDAT_LLM_PROXY_IMAGE ?? "", "-f", path.join(repoRoot, "docker/llm-proxy/Dockerfile"), repoRoot], { encoding: "utf8", timeout: 900_000 });
    if (b.status !== 0) throw new Error(`llm-proxy image: ${b.stderr.slice(-400)}`);
  }
  const up = compose("up", "-d", "--build", "--wait", "--wait-timeout", "300");
  if (up.status !== 0) throw new Error(`compose up failed: ${(up.stderr || up.stdout).slice(-1500)}`);
  // Caddy's internal CA for https://localhost (created at start; read from its volume)
  let ca = "";
  for (let k = 0; k < 60 && !ca.includes("BEGIN CERTIFICATE"); k++) {
    ca = compose("exec", "-T", "caddy", "cat", "/data/caddy/pki/authorities/local/root.crt").stdout;
    if (!ca.includes("BEGIN CERTIFICATE")) await new Promise((r) => setTimeout(r, 500));
  }
  base = `https://localhost:${httpsPort}`;
  https = (url, init) =>
    new Promise((resolve, reject) => {
      const u = new URL(url);
      const req = request({ host: "127.0.0.1", servername: "localhost", port: Number(u.port), path: u.pathname, method: init.method, headers: { ...init.headers, host: `localhost:${u.port}` }, ca }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, json: () => Promise.resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as unknown) }));
      });
      req.on("error", reject);
      req.end(init.body);
    });
  db = openDb(`postgresql://postgres:${pw}@127.0.0.1:${pgPort}/mandat`);
  env.MANDAT_DB_URL = `postgresql://postgres:${pw}@127.0.0.1:${pgPort}/mandat`; // the CLI runs on this computer
  // two teams, three people of team A on one project, one person of team B
  await db.query(`insert into auth.users (id, email) values ${Object.entries(U).map(([k, v]) => `('${v}', '${k}@e10.invalid')`).join(", ")}`);
  await db.query(`insert into public.orgs (id, name) values ('${A}', 'team-a'), ('${B}', 'team-b')`);
  await db.query(`insert into public.members (org_id, user_id, role, role_id) values ('${A}', '${U.ana}', 'viewer', 'builtin:owner'), ('${A}', '${U.boris}', 'viewer', 'builtin:worker'), ('${A}', '${U.vera}', 'viewer', 'builtin:viewer'), ('${B}', '${U.cveta}', 'viewer', 'builtin:owner')`);
  await db.query(`insert into public.repos (id, org_id, provider, full_name, remote_url) values ('${REPO_A}', '${A}', 'local', 'team-a/shop', 'file:///srv/team-a/shop'), ('b2000000-0000-4000-8000-000000000001', '${B}', 'local', 'team-b/shop', 'file:///srv/team-b/shop')`);
}, 1_200_000);

afterAll(async () => {
  await db?.end();
  if (process.env.MANDAT_KEEP_STACK !== "1") compose("down", "-v", "--remove-orphans");
}, 300_000);

describe("E10 hosted: a team on the hosted worker (D-700–D-705)", () => {
  it("the stack: only Caddy answers outside; /api/runner/* reaches the worker over TLS; anything else is 404", async () => {
    expect((await https(`${base}/api/runner/heartbeat`, { method: "POST", headers: {}, body: "{}" })).status).toBe(401);
    expect((await https(`${base}/healthz`, { method: "POST", headers: {}, body: "" })).status).toBe(404);
    const ps = JSON.parse(`[${compose("ps", "--format", "json").stdout.trim().split("\n").join(",")}]`) as { Service: string; Publishers?: { URL: string; PublishedPort: number }[] }[];
    const published = ps.flatMap((s) => (s.Publishers ?? []).filter((p) => p.PublishedPort > 0).map((p) => `${s.Service}@${p.URL}`)).sort();
    expect(published).toEqual(["caddy@127.0.0.1", "postgres@127.0.0.1"]);
    // the key is only in the proxy (AGENTS.md rule 2)
    const workerEnv = compose("exec", "-T", "worker", "node", "-e", "console.log(Object.keys(process.env).filter(k=>/API_KEY/.test(k)).join(','))").stdout.trim();
    expect(workerEnv).toBe("");
  });

  it("roles: the owner adds a runner, the worker and the viewer may not, the other team may not", async () => {
    const make = (uid: string) => asUser<{ t: string }>(uid, "select public.runner_registration_create($1::uuid, 'team-a-runner', 30) as t", [A]);
    for (const who of [U.boris, U.vera, U.cveta]) await expect(make(who).catch((e: unknown) => Promise.reject(new Error(pgErr(e))))).rejects.toThrow("42501");
    const [row] = await make(U.ana);
    expect(row?.t).toMatch(/^mrr_[0-9a-f]{64}$/);
    const runner = new RunnerClient({ url: base, fetch: https });
    const reg = await runner.register({ token: row?.t ?? "", name: "team-a-runner", kinds: ["baseline"] });
    expect(reg.org_id).toBe(A);
    runner.login(reg.runner_id, reg.secret);
    expect(await runner.heartbeat()).toEqual({ runner_id: reg.runner_id, org_id: A, kinds: ["baseline"] });
    (globalThis as { e10Runner?: RunnerClient }).e10Runner = runner;
  });

  it("the team works on one project: Boris (worker) may create the task; the effect runs on the team's runner over HTTPS", async () => {
    const may = async (uid: string) => (await asUser<{ ok: boolean }>(uid, "select private.has_cap($1::uuid, 'task.create', $2::uuid) as ok", [A, REPO_A]))[0]?.ok;
    expect([await may(U.ana), await may(U.boris), await may(U.vera), await may(U.cveta)]).toEqual([true, true, false, false]);
    // what the web's createTask writes after the check (apps/web actions.ts), and the worker's chain rows
    await db.query(`insert into public.tasks (id, org_id, repo_id, type, agent, text, created_by) values ('${TASK}', '${A}', '${REPO_A}', 'bugfix', 'claude', 'fix the discount', '${U.boris}')`);
    await appendLedgerOnline(db, { org_id: A, kind: "task_created", task_id: TASK, payload: { by: U.boris, text: "fix the discount" } });
    await db.query(`insert into public.outbox (org_id, kind, idempotency_key, payload) values ('${A}', 'baseline', 'baseline:${REPO_A}:e10', '{"repo_id":"${REPO_A}"}'), ('${B}', 'baseline', 'baseline:team-b:e10', '{}')`);
    const runner = (globalThis as { e10Runner?: RunnerClient }).e10Runner as RunnerClient;
    const ran: string[] = [];
    expect(await drainOutbox(new HttpOutbox(runner), { baseline: async (r) => void ran.push(r.idempotency_key) })).toEqual({ done: 1, failed: 0, skipped: 0 });
    expect(ran).toEqual([`baseline:${REPO_A}:e10`]);
    const st = (await db.query<{ k: string; s: string }>("select idempotency_key as k, status as s from public.outbox order by id")).rows;
    expect(st).toEqual([{ k: `baseline:${REPO_A}:e10`, s: "done" }, { k: "baseline:team-b:e10", s: "pending" }]);
    const verdict = { run_id: "r_01JE10TEAMAAAAAAAAAAAAAAAA", result: "VERIFIED", reasons: [] as string[] };
    const vh = hashJcs(verdict);
    await db.query(`insert into public.verdicts (org_id, task_id, run_id, attempt, mode, agent, result, base_sha, verdict_hash) values ('${A}', '${TASK}', $1, 1, 'full', 'claude', 'VERIFIED', repeat('a', 40), $2)`, [verdict.run_id, vh]);
    await appendLedgerOnline(db, { org_id: A, kind: "verdict", task_id: TASK, payload: { ...verdict, verdict_hash: vh } });
  });

  it("RLS: Vera (viewer) sees the project, the task, the verdict and the runner; Cveta (team B) sees nothing of it", async () => {
    const seen = async (uid: string) => ({
      tasks: (await asUser<{ id: string }>(uid, "select id from public.tasks where org_id = $1::uuid", [A])).map((r) => r.id),
      verdicts: (await asUser(uid, "select 1 from public.verdicts where org_id = $1::uuid", [A])).length,
      ledger: (await asUser(uid, "select 1 from public.ledger where org_id = $1::uuid", [A])).length,
      runners: (await asUser<{ name: string }>(uid, "select name from public.runners where org_id = $1::uuid", [A])).map((r) => r.name),
      repos: (await asUser(uid, "select 1 from public.repos where org_id = $1::uuid", [A])).length,
      members: (await asUser(uid, "select 1 from public.members where org_id = $1::uuid", [A])).length,
    });
    expect(await seen(U.vera)).toEqual({ tasks: [TASK], verdicts: 1, ledger: 3, runners: ["team-a-runner"], repos: 1, members: 3 });
    expect(await seen(U.cveta)).toEqual({ tasks: [], verdicts: 0, ledger: 0, runners: [], repos: 0, members: 0 });
    await expect(asUser(U.vera, "select secret_hash from public.runners").catch((e: unknown) => Promise.reject(new Error(pgErr(e))))).rejects.toThrow("42501");
  });

  it("audit export of the task: Boris (ledger.export) exports, verify-log --audit passes; Vera and Cveta may not", () => {
    const ok = cli("audit", "export", "--task", TASK, "--as", U.boris, "--out", "team-a.json");
    expect(ok.stderr).toBe("");
    expect(ok.status).toBe(0);
    const x = JSON.parse(readFileSync(path.join(out, "team-a.json"), "utf8")) as { generated_by: string; ledger: { included: boolean }[]; records: { verdicts: unknown[] } };
    expect(x.generated_by).toBe(U.boris);
    expect(x.records.verdicts).toHaveLength(1);
    const v = cli("verify-log", "--audit", "team-a.json");
    expect(v.status).toBe(0);
    expect(v.stdout).toMatch(/OK: chain intact .* payloads and verdicts match/);
    expect(cli("audit", "export", "--task", TASK, "--as", U.vera, "--out", "vera.json").status).toBe(4);
    expect(cli("audit", "export", "--task", TASK, "--as", U.cveta, "--out", "cveta.json").status).toBe(4);
    // the live chain of team A (runner registration, task, verdict, the export itself) still verifies
    expect(cli("verify-log", "--org", A).status).toBe(0);
  });
});
