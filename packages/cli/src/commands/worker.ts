import { fakeGitHub, octokitGitHub } from "@mandat/gate-github";
import type { GitHubPort } from "@mandat/gate-github";
import { broadcasterFromEnv, dbUrl, drainHarnessOutbox, openDb, runDaemonOnce } from "@mandat/worker";
import type { Io } from "../output.js";

// Демо промпт т. 5.8 / 8.1 (D-275): `mandat worker` = MANDAT_MODE=worker. Offline: fakeGitHub in memory; online: the
// Writer App from env (GITHUB_WRITER_*). Realtime broadcast only when the worker finds SUPABASE_URL + the service key (broadcasterFromEnv).
/** D-299: how many tasks run at the same time (each in its own sandbox, gate and network; the claim is SKIP LOCKED). */
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
      : fakeGitHub({ repos: { [repo]: {} } });
  const broadcast = broadcasterFromEnv(env);
  io.stderr(`mandat worker: ${gh === undefined ? "?" : env.GITHUB_WRITER_APP_ID ? "GitHub App" : "fakeGitHub (offline)"} · realtime ${broadcast ? "on" : "off (polling)"}\n`);
  const slots = o.slots ?? slotsFrom(env.MANDAT_WORKER_SLOTS, 1);
  if (slots > 1) io.stderr(`mandat worker: ${slots} задачи едновременно\n`);
  try {
    await workerSlots({
      slots,
      once: o.once,
      pollMs: o.pollMs ?? 2000,
      ...(o.signal ? { signal: o.signal } : {}),
      tick: () => runDaemonOnce({ db, home: o.home, gh, ghRepo: repo, ...(broadcast ? { broadcast } : {}), log: (l) => io.stderr(l + "\n") }),
      drain: async () => {
        const fx = await drainHarnessOutbox({ db, gh, ghRepo: repo });
        if (fx.done + fx.failed > 0) io.stderr(`[outbox] harness: ${fx.done} done, ${fx.failed} failed\n`);
      },
    });
    return 0;
  } finally {
    await db.end();
  }
}
