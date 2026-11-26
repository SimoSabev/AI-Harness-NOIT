import { existsSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import path from "node:path";
import { runBench } from "@mandat/bench";
import { fakeGitHub, octokitGitHub } from "@mandat/gate-github";
import type { BenchRunner, EvolveTick, JobTick, NightTick, SelfFinishTick, TwinTick } from "@mandat/worker";
import type { GitHubPort } from "@mandat/gate-github";
import type { SqlClient } from "@mandat/ledger";
import { broadcasterFromEnv, chatModelFor, closeExpiredHeld, conversationLoop, dbUrl, drainHarnessOutbox, evolveTick, heldDays, hostedFromEnv, jobTick, hostConfig, isDbConnectionError, isProcessing, nightShiftTick, openDb, selfFinishTick, pgKeyStore, pollCi, runBaseline, runDaemonOnce, startHostedServer, sweepOverdue, twinTick, vetMcpDocker, workerRole } from "@mandat/worker";
import { loadKek } from "@mandat/llm-proxy";
import { realDockerRunner } from "@mandat/sandbox";
import { profilePrintExec, researchDeps, researchLoop } from "./research.js";
import { repoRoot } from "../paths.js";
import type { Io } from "../output.js";

// Демо промпт т. 5.8 / 8.1 (D-275): `mandat worker` = MANDAT_MODE=worker. Offline: fakeGitHub in memory; online: the
// Writer App from env (GITHUB_WRITER_*). Realtime broadcast only when the worker finds SUPABASE_URL + the service key (broadcasterFromEnv).
/** D-299: how many tasks run at the same time (each in its own sandbox, gate and network; the claim is SKIP LOCKED). */
/** E9а: the night shift's tick at most every `everyMs` (30 s), logging what changed */
export function nightTicker(o: { now: () => number; log: (line: string) => void; tick: () => Promise<NightTick>; everyMs?: number }): () => Promise<void> {
  let last = Number.NEGATIVE_INFINITY;
  return async () => {
    if (o.now() - last < (o.everyMs ?? 30_000)) return;
    last = o.now();
    const n = await o.tick();
    for (const id of n.started) o.log(`[night] shift ${id} started`);
    if (n.parked.length > 0) o.log(`[night] parked: ${n.parked.join(", ")}`);
    for (const id of n.done) o.log(`[night] shift ${id} done`);
  };
}

/** D-521: the daytime „Сам довършва“ tick at most every `everyMs` (30 s); MANDAT_SELF_FINISH=0 turns it off */
export function selfTicker(o: { env: NodeJS.ProcessEnv; now: () => number; log: (line: string) => void; tick: () => Promise<SelfFinishTick>; everyMs?: number }): () => Promise<void> {
  let last = Number.NEGATIVE_INFINITY;
  return async () => {
    if (o.env.MANDAT_SELF_FINISH === "0" || o.now() - last < (o.everyMs ?? 30_000)) return;
    last = o.now();
    const n = await o.tick();
    if (n.retried.length > 0) o.log(`[self] new attempt by Mandat: ${n.retried.join(", ")}`);
  };
}

/**
 * D-535: the jobs (planner, units, final check, seal, merge after approval) beside the other ticks, never blocking them
 * (the planner is a model call): in the background, never twice at once, at most every `everyMs` (5 s); MANDAT_JOBS=0 off.
 */
export function jobTicker(o: { env: NodeJS.ProcessEnv; now: () => number; log: (line: string) => void; tick: () => Promise<JobTick>; everyMs?: number }): () => void {
  let next = 0;
  let running = false;
  return () => {
    if (o.env.MANDAT_JOBS === "0" || running || o.now() < next) return;
    running = true;
    next = o.now() + (o.everyMs ?? 5_000);
    void o.tick()
      .then((n) => {
        for (const [what, ids] of [["planned", n.planned], ["parked", n.parked], ["sealed", n.sealed], ["merged into main", n.merged]] as const) if (ids.length > 0) o.log(`[job] ${what}: ${ids.join(", ")}`);
      })
      .catch((e: unknown) => o.log(`[job] tick failed: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`))
      .finally(() => {
        running = false;
      });
  };
}

/** D-523: the owner's twin, at most every `everyMs` (30 s); logs its own approvals and each class offer once; MANDAT_TWIN=0 turns it off */
export function twinTicker(o: { env: NodeJS.ProcessEnv; now: () => number; log: (line: string) => void; tick: () => Promise<TwinTick>; everyMs?: number }): () => Promise<void> {
  let last = Number.NEGATIVE_INFINITY;
  const offered = new Set<string>();
  return async () => {
    if (o.env.MANDAT_TWIN === "0" || o.now() - last < (o.everyMs ?? 30_000)) return;
    last = o.now();
    const n = await o.tick();
    if (n.decided.length > 0) o.log(`[twin] approved alone: ${n.decided.join(", ")}`);
    const fresh = n.offers.filter((k) => !offered.has(k));
    for (const k of fresh) offered.add(k);
    if (fresh.length > 0) o.log(`[twin] ready to offer: ${fresh.join(", ")}`);
  };
}

/**
 * D-530: profile evolution beside the other ticks, never blocking them (its bench takes minutes): started in the
 * background, never twice at once, at most every `everyMs` (30 min); after an error it waits 6 hours; MANDAT_EVOLVE=0 off.
 */
export function evolveTicker(o: { env: NodeJS.ProcessEnv; now: () => number; log: (line: string) => void; tick: () => Promise<EvolveTick>; everyMs?: number }): () => void {
  let next = 0;
  let running = false;
  return () => {
    if (o.env.MANDAT_EVOLVE === "0" || running || o.now() < next) return;
    running = true;
    next = o.now() + (o.everyMs ?? 30 * 60_000);
    void o.tick()
      .then((n) => {
        for (const [what, ids] of [["proposed", n.proposed], ["accepted", n.accepted], ["refused", n.refused], ["rolled back", n.rolledBack]] as const) if (ids.length > 0) o.log(`[evolve] ${what}: ${ids.join(", ")}`);
      })
      .catch((e: unknown) => {
        next = o.now() + 6 * 3600_000;
        o.log(`[evolve] paused for 6 h: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`);
      })
      .finally(() => {
        running = false;
      });
  };
}

export function slotsFrom(v: string | undefined, fallback: number): number {
  const n = v && /^\d+$/.test(v) ? Number(v) : 0;
  return n >= 1 ? Math.min(n, 8) : fallback;
}

export interface SlotLoop {
  slots: number;
  once: boolean;
  pollMs: number;
  signal?: AbortSignal;
  tick: () => Promise<string | null>;
  drain: () => Promise<void>;
  log?: (line: string) => void;
}

/** N task loops + ONE effects loop (harness, approvals, push), so a long task never holds an approval back. */
export async function workerSlots(o: SlotLoop): Promise<void> {
  let tasksDone = false;
  const sleep = () => new Promise((r) => setTimeout(r, o.pollMs));
  // D-444: a lost database connection waits for the next pass; --once and any other error still reach the caller
  let down = false;
  const surviving = async <T>(fn: () => Promise<T>, whileDown: T): Promise<T> => {
    try {
      const v = await fn();
      if (down) {
        down = false;
        o.log?.("[db] connection back");
      }
      return v;
    } catch (e) {
      if (o.once || !isDbConnectionError(e)) throw e;
      if (!down) {
        down = true;
        o.log?.("[db] connection lost; retrying");
      }
      return whileDown;
    }
  };
  const loop = async () => {
    for (;;) {
      const id = await surviving(o.tick, null);
      if (o.once || o.signal?.aborted) return;
      if (!id) await sleep();
      if (o.signal?.aborted) return;
    }
  };
  const effects = async () => {
    for (;;) {
      await surviving(o.drain, undefined);
      if (o.once ? tasksDone : o.signal?.aborted) return;
      await sleep();
    }
  };
  const fx = effects();
  await Promise.all(Array.from({ length: o.slots }, () => loop()));
  tasksDone = true;
  await fx;
  if (o.once) await o.drain(); // effects of the task(s) just finished (e.g. an approval PR)
}

/**
 * E10 hosted (D-700): with MANDAT_HOSTED=1 the worker opens MANDAT_WEBHOOK_HOST:MANDAT_WEBHOOK_PORT (Caddy in front):
 * /healthz, the runner protocol and the GitHub webhooks. Without it nothing listens (pnpm local, the desktop).
 */
export async function serveHosted(io: Io, o: { db: SqlClient; env: NodeJS.ProcessEnv }): Promise<Server | null> {
  const h = hostedFromEnv(o.env, o.db, (f) => readFileSync(f, "utf8"), (l) => io.stderr(`${l}\n`));
  if (!h) return null;
  const host = o.env.MANDAT_WEBHOOK_HOST ?? "127.0.0.1";
  const port = Number(o.env.MANDAT_WEBHOOK_PORT ?? 8790);
  const s = await startHostedServer(h, { host, port });
  io.stderr(`mandat worker: hosted port ${host}:${port} · runner protocol ${h.runner ? "on" : "off"} · webhooks ${h.webhook ? "on" : "off"}\n`);
  return s;
}

const untilStopped = (signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    signal?.addEventListener("abort", () => resolve(), { once: true });
    process.once("SIGTERM", () => resolve());
    process.once("SIGINT", () => resolve());
  });

export async function workerCommand(io: Io, o: { home: string; once: boolean; pollMs?: number; signal?: AbortSignal; slots?: number }): Promise<number> {
  const env = io.env;
  const db = openDb(dbUrl(env));
  const role = workerRole(env);
  const server = await serveHosted(io, { db, env });
  const closeServer = (): Promise<void> => new Promise((r) => (server ? server.close(() => r()) : r()));
  if (role === "api") {
    // a hosted front only: the runner protocol and webhooks; tasks and effects run elsewhere (remote runners, another worker)
    try {
      if (!server) {
        io.stderr("MANDAT_WORKER_ROLE=api needs MANDAT_HOSTED=1\n");
        return 2;
      }
      await untilStopped(o.signal);
      return 0;
    } finally {
      await closeServer();
      await db.end();
    }
  }
  const repo = env.GITHUB_DEMO_REPO ?? "mandat-demo/shop";
  const gh: GitHubPort =
    env.GITHUB_WRITER_APP_ID && env.GITHUB_WRITER_PRIVATE_KEY && env.GITHUB_WRITER_INSTALLATION_ID
      ? octokitGitHub({ appId: env.GITHUB_WRITER_APP_ID, privateKey: env.GITHUB_WRITER_PRIVATE_KEY, installationId: Number(env.GITHUB_WRITER_INSTALLATION_ID) })
      : fakeGitHub({ repos: { [repo]: {} }, autoRepos: true });
  // D-388: local projects added on this computer have their GitHub side offline only, never on the App's GitHub
  const localGh = fakeGitHub({ autoRepos: true });
  const broadcast = broadcasterFromEnv(env);
  io.stderr(`mandat worker: ${gh === undefined ? "?" : env.GITHUB_WRITER_APP_ID ? "GitHub App" : "fakeGitHub (offline)"} · realtime ${broadcast ? "on" : "off (polling)"}\n`);
  const slots = o.slots ?? slotsFrom(env.MANDAT_WORKER_SLOTS, 1);
  // E8e (D-354): an MCP server's secrets are one sealed value (provider mcp:<name>) = a JSON object NAME → value
  const mcpSecrets = async (org: string, name: string): Promise<Record<string, string>> => {
    const raw = await pgKeyStore(db, org, loadKek({ env, mandatHome: o.home })).get(`mcp:${name}`);
    const j: unknown = raw ? JSON.parse(raw) : {};
    return j !== null && typeof j === "object" ? Object.fromEntries(Object.entries(j).filter((e): e is [string, string] => typeof e[1] === "string")) : {};
  };
  if (slots > 1) io.stderr(`mandat worker: ${slots} задачи едновременно\n`);
  // E9а (v5 5.1): the night shift ticks every 30 s; its tasks are normal tasks the slots claim
  const night = nightTicker({ now: () => Date.now(), log: (l) => io.stderr(`${l}\n`), tick: () => nightShiftTick(db, { now: new Date(), slots: slotsFrom(env.MANDAT_NIGHT_SLOTS, Math.max(1, slots)), agent: env.MANDAT_NIGHT_AGENT ?? "claude" }) });
  const self = selfTicker({ env, now: () => Date.now(), log: (l) => io.stderr(`${l}\n`), tick: () => selfFinishTick(db, { now: new Date() }) });
  // D-530: the bench gate runs the scenarios of the task type's contract with the current and the changed profile;
  // MANDAT_EVOLVE_BENCH=0 keeps trials proposed (no bench, nothing accepted)
  const bench: BenchRunner = async (layers, type) => {
    const common = { home: o.home, contractPath: path.join(repoRoot, "contracts", "fix-discount.json"), freeContractPath: path.join(repoRoot, "contracts", "free-cart.json"), env, layers, kind: type === "free" ? ("free" as const) : ("default" as const) };
    const r = await runBench(common);
    if (r.infraError) throw new Error(`bench: ${r.infraError}`);
    // D-550: the held-out heavy set is the second gate; only its counts leave
    const h = await runBench({ ...common, set: "heldout" });
    if (h.infraError) throw new Error("bench: the held-out set did not run");
    return { pass: r.pass, total: r.rows.length, false_verified: r.false_verified, heldout: { pass: h.pass, total: h.rows.length, false_verified: h.false_verified } };
  };
  const evolve = evolveTicker({ env, now: () => Date.now(), log: (l) => io.stderr(`${l}\n`), tick: () => evolveTick(db, { now: new Date(), requireHeldout: true, ...(env.MANDAT_EVOLVE_BENCH === "0" ? {} : { bench }) }) });
  const twin = twinTicker({ env, now: () => Date.now(), log: (l) => io.stderr(`${l}\n`), tick: () => twinTick(db, { now: new Date() }) });
  // E9г (D-409): research runs beside the task slots (≤ 2 here, ≤ 2 per org); MANDAT_RESEARCH=0 turns it off
  const host = hostConfig(env);
  const research = env.MANDAT_RESEARCH === "0" ? Promise.resolve() : researchLoop(researchDeps({ db, io, home: o.home, docker: realDockerRunner(), inferencePort: host.proxyInferencePort, adminPort: host.proxyAdminPort }), { once: o.once, pollMs: o.pollMs ?? 2000, ...(o.signal ? { signal: o.signal } : {}) });
  // D-531 (E10а ф. 1): conversations beside research — a key or a connection through the proxy (no container), a Claude
  // subscription in its profile container (D-295); MANDAT_CHAT=0 turns it off
  const secretPath = path.join(o.home, "proxy", "secret");
  const chatProxy = { url: `http://127.0.0.1:${host.proxyInferencePort}`, secretPath };
  const chatExec = profilePrintExec(realDockerRunner());
  const chat = env.MANDAT_CHAT === "0" ? Promise.resolve() : conversationLoop({ db, log: (l) => io.stderr(`${l}
`), modelFor: (r) => chatModelFor({ proxy: existsSync(secretPath) ? chatProxy : null, profileExec: chatExec }, r) }, { once: o.once, pollMs: 500, ...(o.signal ? { signal: o.signal } : {}) });
  // D-535: the jobs' planner answers through the conversation's model paths (proxy, connection, subscription, demo)
  const jobs = jobTicker({ env, now: () => Date.now(), log: (l) => io.stderr(`${l}
`), tick: () => jobTick({ db, log: (l) => io.stderr(`${l}
`), modelFor: (r) => chatModelFor({ proxy: existsSync(secretPath) ? chatProxy : null, profileExec: chatExec }, r) }) });
  try {
    await workerSlots({
      slots,
      once: o.once,
      pollMs: o.pollMs ?? 2000,
      ...(o.signal ? { signal: o.signal } : {}),
      log: (l) => io.stderr(`${l}\n`),
      // E8g (D-353): steering a live Claude Code waits for spike S2 (live); MANDAT_STEER=1 turns it on
      tick: () => runDaemonOnce({ db, home: o.home, gh, ghRepo: repo, localGh, ...(broadcast ? { broadcast } : {}), log: (l) => io.stderr(l + "\n"), ...(env.MANDAT_STEER === "1" ? { steer: true } : {}), mcpSecrets }),
      drain: async () => {
        // E7г (D-314): the baseline at connect runs in the sandbox; MANDAT_BASELINE=0 turns it off
        const baselineRunner = env.MANDAT_BASELINE === "0" ? undefined : (dir: string, policy: Parameters<typeof runBaseline>[1]) => runBaseline(dir, policy, { mandatHome: o.home, repoRoot, env });
        // E8g: overdue HELD tasks are closed before the outbox drains, so their notification goes out in the same pass
        const expired = await closeExpiredHeld(db, { now: new Date(), days: heldDays(env) });
        if (expired.length > 0) io.stderr(`[held] expired: ${expired.join(", ")}\n`);
        // D-451: a working task nobody works on any more (the worker crashed or was stopped) → BLOCKED, never live forever
        const swept = (await sweepOverdue(db, { now: new Date(), env, alive: isProcessing })).filter((x) => x.kind === "blocked");
        if (swept.length > 0) io.stderr(`[sweep] blocked: ${swept.map((x) => x.task_id).join(", ")}\n`);
        await night();
        await self();
        jobs();
        await twin();
        evolve();
        // E8g (D-356): the project's CI on Mandat's PRs (a red round → HELD ci_failed)
        const red = await pollCi({ db, gh, ghRepo: repo, localGh }).catch(() => []);
        if (red.length > 0) io.stderr(`[ci] failed: ${red.join(", ")}\n`);
        // E8e (D-354): vetting an approved MCP server runs it once in Docker without network; MANDAT_MCP_VET=0 turns it off
        const mcpVetRunner = env.MANDAT_MCP_VET === "0" ? undefined : (s: Parameters<typeof vetMcpDocker>[0]) => vetMcpDocker(s, { mandatHome: o.home, repoRoot, env });
        const fx = await drainHarnessOutbox({ db, gh, ghRepo: repo, localGh, ...(baselineRunner ? { baselineRunner } : {}), ...(mcpVetRunner ? { mcpVetRunner } : {}) });
        if (fx.done + fx.failed > 0) io.stderr(`[outbox] harness: ${fx.done} done, ${fx.failed} failed\n`);
      },
    });
    await research;
    await chat;
    return 0;
  } finally {
    await closeServer();
    await db.end();
  }
}
