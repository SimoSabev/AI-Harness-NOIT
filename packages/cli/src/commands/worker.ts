import { fakeGitHub, octokitGitHub } from "@mandat/gate-github";
import type { NightTick } from "@mandat/worker";
import type { GitHubPort } from "@mandat/gate-github";
import { broadcasterFromEnv, closeExpiredHeld, dbUrl, drainHarnessOutbox, heldDays, hostConfig, nightShiftTick, openDb, pgKeyStore, pollCi, runBaseline, runDaemonOnce, vetMcpDocker } from "@mandat/worker";
import { loadKek } from "@mandat/llm-proxy";
import { realDockerRunner } from "@mandat/sandbox";
import { researchDeps, researchLoop } from "./research.js";
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
}

/** N task loops + ONE effects loop (harness, approvals, push), so a long task never holds an approval back. */
export async function workerSlots(o: SlotLoop): Promise<void> {
  let tasksDone = false;
  const sleep = () => new Promise((r) => setTimeout(r, o.pollMs));
  const loop = async () => {
    for (;;) {
      const id = await o.tick();
      if (o.once || o.signal?.aborted) return;
      if (!id) await sleep();
      if (o.signal?.aborted) return;
    }
  };
  const effects = async () => {
    for (;;) {
      await o.drain();
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

export async function workerCommand(io: Io, o: { home: string; once: boolean; pollMs?: number; signal?: AbortSignal; slots?: number }): Promise<number> {
  const env = io.env;
  const db = openDb(dbUrl(env));
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
  // E9г (D-409): research runs beside the task slots (≤ 2 here, ≤ 2 per org); MANDAT_RESEARCH=0 turns it off
  const host = hostConfig(env);
  const research = env.MANDAT_RESEARCH === "0" ? Promise.resolve() : researchLoop(researchDeps({ db, io, home: o.home, docker: realDockerRunner(), inferencePort: host.proxyInferencePort, adminPort: host.proxyAdminPort }), { once: o.once, pollMs: o.pollMs ?? 2000, ...(o.signal ? { signal: o.signal } : {}) });
  try {
    await workerSlots({
      slots,
      once: o.once,
      pollMs: o.pollMs ?? 2000,
      ...(o.signal ? { signal: o.signal } : {}),
      // E8g (D-353): steering a live Claude Code waits for spike S2 (live); MANDAT_STEER=1 turns it on
      tick: () => runDaemonOnce({ db, home: o.home, gh, ghRepo: repo, localGh, ...(broadcast ? { broadcast } : {}), log: (l) => io.stderr(l + "\n"), ...(env.MANDAT_STEER === "1" ? { steer: true } : {}), mcpSecrets }),
      drain: async () => {
        // E7г (D-314): the baseline at connect runs in the sandbox; MANDAT_BASELINE=0 turns it off
        const baselineRunner = env.MANDAT_BASELINE === "0" ? undefined : (dir: string, policy: Parameters<typeof runBaseline>[1]) => runBaseline(dir, policy, { mandatHome: o.home, repoRoot, env });
        // E8g: overdue HELD tasks are closed before the outbox drains, so their notification goes out in the same pass
        const expired = await closeExpiredHeld(db, { now: new Date(), days: heldDays(env) });
        if (expired.length > 0) io.stderr(`[held] expired: ${expired.join(", ")}\n`);
        await night();
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
    return 0;
  } finally {
    await db.end();
  }
}
