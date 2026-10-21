import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { imageTags } from "@mandat/sandbox";
import { buildFixture, hostConfig, openDb, seedLocal } from "@mandat/worker";
import { realDeps } from "../deps.js";
import type { Io } from "../output.js";
import { repoRoot } from "../paths.js";
import { startControl } from "./local-control.js";
import type { Keys } from "./local-control.js";
import { proxyProviders, proxyStart, proxyStop } from "./proxy.js";
import { listAccounts } from "./accounts.js";
import { newBase32Secret } from "./demo.js";
import { slotsFrom, workerCommand } from "./worker.js";

// D-292: `pnpm local` — everything on this machine with one command: Postgres in Docker (shim + migrations, no
// Supabase CLI), the demo repo, a fresh password for the one local account, the images, the web UI and the worker.
export const LOCAL_DB = Object.freeze({ container: "mandat-local-db", volume: "mandat-local-db", image: "postgres:17.6-alpine" });
export const WEB_PORT = 3000;

export function dbRunArgs(port: number): string[] {
  return ["run", "-d", "--name", LOCAL_DB.container, "-v", `${LOCAL_DB.volume}:/var/lib/postgresql/data`, "-e", "POSTGRES_PASSWORD=postgres", "-p", `127.0.0.1:${port}:5432`, LOCAL_DB.image];
}

export function localDbUrl(port: number): string {
  return `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
}

/** The shim (roles, auth.users) goes first, then every migration file not applied yet, in name order. */
export function pendingMigrations(files: string[], applied: Set<string>): string[] {
  return ["shim", ...[...files].sort()].filter((f) => !applied.has(f));
}

/** D-297: printed once, when the local account gets its TOTP secret (owner approvals of the harness rules need a fresh code). */
export function totpLines(email: string, secret: string): string[] {
  return [
    "  Двуфакторен код (само сега): добави в приложение за кодове (Google Authenticator, 1Password…)",
    `  Ключ:    ${secret}`,
    `  Адрес:   otpauth://totp/Hamut:${encodeURIComponent(email)}?secret=${secret}&issuer=Hamut&algorithm=SHA1&digits=6&period=30`,
    "  Трябва за одобрение на правилата на репото и на задачи с повече свобода.",
  ];
}

const docker = (args: string[]) => spawnSync("docker", args, { encoding: "utf8" });

function ensureDb(io: Io, port: number): boolean {
  if (docker(["info"]).status !== 0) {
    io.stderr("Docker не работи. Пусни Docker Desktop (или dockerd) и опитай пак.\n");
    return false;
  }
  const st = docker(["inspect", "-f", "{{.State.Running}}", LOCAL_DB.container]);
  if (st.status !== 0) {
    io.stderr(`база: създавам ${LOCAL_DB.container} (${LOCAL_DB.image}) на 127.0.0.1:${port}\n`);
    const r = docker(dbRunArgs(port));
    if (r.status !== 0) {
      io.stderr(`база: ${r.stderr.trim()}\n`);
      return false;
    }
  } else if (st.stdout.trim() !== "true") {
    docker(["start", LOCAL_DB.container]);
  }
  return true;
}

async function connect(url: string): Promise<ReturnType<typeof openDb> | null> {
  for (let i = 0; i < 60; i++) {
    const db = openDb(url);
    try {
      await db.query("select 1");
      return db;
    } catch {
      await db.end().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return null;
}

async function migrate(io: Io, db: ReturnType<typeof openDb>): Promise<void> {
  await db.query("create schema if not exists mandat_local; create table if not exists mandat_local.migrations (name text primary key, applied_at timestamptz not null default now())");
  const applied = new Set((await db.query<{ name: string }>("select name from mandat_local.migrations")).rows.map((r) => r.name));
  const dir = path.join(repoRoot, "supabase/migrations");
  for (const f of pendingMigrations(readdirSync(dir).filter((x) => x.endsWith(".sql")), applied)) {
    const sql = readFileSync(f === "shim" ? path.join(repoRoot, "supabase/shim/supabase-shim.sql") : path.join(dir, f), "utf8");
    await db.query(sql);
    await db.query("insert into mandat_local.migrations (name) values ($1)", [f]);
    io.stderr(`база: приложено ${f}\n`);
  }
}

async function ensureImages(io: Io): Promise<boolean> {
  const t = await imageTags(repoRoot);
  if ([t.sandbox, t.gate, t.proxy].every((x) => docker(["image", "inspect", x]).status === 0)) return true;
  io.stderr("образи: липсват, правя ги (първия път е бавно, 5–15 мин)…\n");
  const env = Object.fromEntries(Object.entries(io.env).filter(([k]) => k !== "ANTHROPIC_API_KEY" && k !== "OPENAI_API_KEY"));
  const r = spawnSync(process.execPath, [path.join(repoRoot, "packages/cli/dist/main.js"), "images", "build"], { stdio: "inherit", env });
  return r.status === 0;
}

export async function localCommand(io: Io, o: { home: string; dbPort: number; signal?: AbortSignal }): Promise<number> {
  if (!ensureDb(io, o.dbPort)) return 3;
  const url = localDbUrl(o.dbPort);
  const db = await connect(url);
  if (!db) {
    io.stderr("база: не отговаря след 60 s\n");
    return 3;
  }
  const password = randomBytes(9).toString("base64url");
  let email: string;
  let totp: string | null = null;
  try {
    await migrate(io, db);
    const fx = buildFixture({ repoRoot, mandatHome: o.home, force: false, name: "demo-shop" });
    const seeded = await seedLocal(db, { remoteUrl: `file://${path.resolve(fx.mirror)}`, password, totpSecret: newBase32Secret });
    email = seeded.email;
    totp = seeded.totpSecret;
  } finally {
    await db.end();
  }
  if (!(await ensureImages(io))) return 3;

  // D-293: keys go to the proxy only (from the UI through the control endpoint, or once from this command's env);
  // the web server and the worker never get them in their env.
  const deps = realDeps();
  const host = hostConfig(io.env);
  const clean = Object.fromEntries(Object.entries(io.env).filter(([k]) => k !== "ANTHROPIC_API_KEY" && k !== "OPENAI_API_KEY"));
  const startProxy = async (k: Keys) => (await proxyStart({ ...io, stdout: () => undefined, env: { ...clean, ANTHROPIC_API_KEY: k.anthropic, ...(k.openai ? { OPENAI_API_KEY: k.openai } : {}) } }, deps, { mandatHome: o.home, host, json: true, force: true })) === 0;
  const fromEnv = io.env.ANTHROPIC_API_KEY;
  if (fromEnv) {
    io.stderr("прокси: пускам с ключа от env…\n");
    await startProxy({ anthropic: fromEnv, ...(io.env.OPENAI_API_KEY ? { openai: io.env.OPENAI_API_KEY } : {}) });
  }
  const control = await startControl({
    start: startProxy,
    stop: async () => void (await proxyStop({ ...io, stdout: () => undefined }, deps, { json: true, port: host.proxyAdminPort })),
    providers: () => proxyProviders(deps),
    accounts: () => listAccounts(deps),
  });
  const env = { ...clean, MANDAT_DB_URL: url, MANDAT_DEMO_DEV_AUTH: "1", NEXT_TELEMETRY_DISABLED: "1", MANDAT_LOCAL_CONTROL_URL: control.url, MANDAT_LOCAL_CONTROL_TOKEN: control.token };
  // `pnpm local` builds first (pnpm build); the production server is faster than `next dev` and has no dev overlay.
  const web = spawn("pnpm", ["--filter", "@mandat/web", "start"], { cwd: repoRoot, env, stdio: ["ignore", "ignore", "inherit"] });
  const stop = new AbortController();
  const onSig = () => stop.abort();
  process.once("SIGINT", onSig);
  process.once("SIGTERM", onSig);
  o.signal?.addEventListener("abort", onSig);
  web.on("exit", onSig);

  const slots = slotsFrom(io.env.MANDAT_WORKER_SLOTS, 2);
  io.stdout(
    [
      "",
      "  Хамут работи локално (съдия: Мандат)",
      `  Отвори:  http://localhost:${WEB_PORT}`,
      `  Имейл:   ${email}`,
      `  Парола:  ${password}   (нова при всяко пускане)`,
      ...(totp ? ["", ...totpLines(email, totp)] : []),
      "",
      `  Задачи едновременно: ${slots} (MANDAT_WORKER_SLOTS=1..8)`,
      "  Демо агентите работят без ключ. За Claude Code и Codex: Ключове в менюто",
      "  (ключът отива само в проксито; не се записва никъде)",
      "  Спиране: Ctrl+C (базата остава; изтриване: docker rm -f mandat-local-db && docker volume rm mandat-local-db)",
      "",
    ].join("\n") + "\n",
  );
  try {
    return await workerCommand({ ...io, env: { ...clean, MANDAT_DB_URL: url } }, { home: o.home, once: false, signal: stop.signal, slots });
  } finally {
    web.kill("SIGTERM");
    await control.close();
  }
}
