import { fakeGitHub, octokitGitHub } from "@mandat/gate-github";
import type { GitHubPort } from "@mandat/gate-github";
import { dbUrl, openDb, realtimeBroadcaster, runDaemonOnce } from "@mandat/worker";
import type { Io } from "../output.js";

// Демо промпт т. 5.8 / 8.1 (D-275): `mandat worker` = MANDAT_MODE=worker. Offline: fakeGitHub in memory; online: the
// Writer App from env (GITHUB_WRITER_*). Realtime broadcast only when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
export async function workerCommand(io: Io, o: { home: string; once: boolean; pollMs?: number; signal?: AbortSignal }): Promise<number> {
  const env = io.env;
  const db = openDb(dbUrl(env));
  const repo = env.GITHUB_DEMO_REPO ?? "mandat-demo/shop";
  const gh: GitHubPort =
    env.GITHUB_WRITER_APP_ID && env.GITHUB_WRITER_PRIVATE_KEY && env.GITHUB_WRITER_INSTALLATION_ID
      ? octokitGitHub({ appId: env.GITHUB_WRITER_APP_ID, privateKey: env.GITHUB_WRITER_PRIVATE_KEY, installationId: Number(env.GITHUB_WRITER_INSTALLATION_ID) })
      : fakeGitHub({ repos: { [repo]: {} } });
  const broadcast = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? realtimeBroadcaster({ url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_ROLE_KEY }) : undefined;
  io.stderr(`mandat worker: ${gh === undefined ? "?" : env.GITHUB_WRITER_APP_ID ? "GitHub App" : "fakeGitHub (offline)"} · realtime ${broadcast ? "on" : "off (polling)"}\n`);
  try {
    for (;;) {
      const id = await runDaemonOnce({ db, home: o.home, gh, ghRepo: repo, ...(broadcast ? { broadcast } : {}), log: (l) => io.stderr(l + "\n") });
      if (o.once) return 0;
      if (o.signal?.aborted) return 0;
      if (!id) await new Promise((r) => setTimeout(r, o.pollMs ?? 2000));
    }
  } finally {
    await db.end();
  }
}
