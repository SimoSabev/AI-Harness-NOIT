import { spawn, spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statfsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import { compareVersions, imageTags } from "@mandat/sandbox";
import { DEMO_ORG_ID, DEMO_OWNER_ID, buildFixture, hostConfig, openDb, seedLocal } from "@mandat/worker";
import { realDeps } from "../deps.js";
import { cliLang, tt } from "../i18n.js";
import type { Lang } from "../i18n.js";
import type { Io } from "../output.js";
import { repoRoot } from "../paths.js";
import { startControl } from "./local-control.js";
import type { Keys } from "./local-control.js";
import { proxyProviders, proxyStart, proxyStop } from "./proxy.js";
import { hasSealedKeys, proxyLocked } from "./proxy-heal.js";
import { listAccounts, loginDeps, logoutProfile } from "./accounts.js";
import { LoginSessions } from "./login-session.js";
import { SystemJobs } from "./system-jobs.js";
import type { JobRun } from "./system-jobs.js";
import { slotsFrom, workerCommand } from "./worker.js";

// D-292: `pnpm local` — everything on this machine with one command: Postgres in Docker (shim + migrations, no
// Supabase CLI), the demo repo, the images, the web UI and the worker. D-368: no login — the web serves the one local
// owner, listens on 127.0.0.1 only and answers only a loopback Host (apps/web local-auth.ts).
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

/** D-368: `next start` listens on 0.0.0.0 by default; without a login the harness must not be reachable from the network.
 * E9g A5 (D-376): run with the Node that runs this CLI (process.execPath), not through pnpm, so the desktop package
 * (Electron's Node, ELECTRON_RUN_AS_NODE) needs no pnpm. */
export function localWebArgs(nextBin: string): string[] {
  return [nextBin, "start", "-p", String(WEB_PORT), "-H", "127.0.0.1"];
}

/** The `next` executable as apps/web resolves it (pnpm's isolated tree in the repo, a hoisted one in the desktop package). */
export function localWebBin(root: string): string {
  return createRequire(path.join(root, "apps/web/package.json")).resolve("next/dist/bin/next");
}

/**
 * D-374 (E9g review): the KEK the desktop app passes in (MANDAT_KEK) is for this process only — the proxy start and the
 * worker run here and read it; the web server and the system jobs never need it, so their env goes without it.
 */
function withoutKek(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const { MANDAT_KEK: _kek, ...rest } = env;
  return rest;
}

/** D-370 + D-374: the env of a system job (`mandat …` from the web): no API keys (clean), no KEK. */
export function localJobEnv(clean: Record<string, string | undefined>, dbUrl: string): Record<string, string | undefined> {
  return { ...withoutKek(clean), MANDAT_DB_URL: dbUrl };
}

/** The web server's env: the local owner instead of a login (D-368), the control endpoint for keys (D-293), no API keys, no KEK (D-374). */
export function localWebEnv(clean: Record<string, string | undefined>, o: { dbUrl: string; control: { url: string; token: string } }): Record<string, string | undefined> {
  const { MANDAT_DEMO_DEV_AUTH: _dev, ...rest } = withoutKek(clean);
  return { ...rest, MANDAT_DB_URL: o.dbUrl, MANDAT_LOCAL_OWNER: DEMO_OWNER_ID, NEXT_TELEMETRY_DISABLED: "1", MANDAT_LOCAL_CONTROL_URL: o.control.url, MANDAT_LOCAL_CONTROL_TOKEN: o.control.token };
}

/** D-370: a system job = this CLI again (`node main.js …`) without the API keys in its env (D-293). */
function cliRun(env: Record<string, string | undefined>): JobRun {
  return (argv, o) => {
    const child = spawn(process.execPath, [path.join(repoRoot, "packages/cli/dist/main.js"), ...argv], { cwd: repoRoot, env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8").on("data", o.stdout);
    child.stderr.setEncoding("utf8").on("data", o.stderr);
    let done = false;
    const exit = (code: number) => void (done || ((done = true), o.exit(code)));
    child.on("error", () => exit(127));
    child.on("close", (code) => exit(code ?? 1));
  };
}

export function localBanner(slots: number): string[] {
  return [
    "",
    "  Харнесът работи локално (съдия: Мандат)",
    `  Отвори:  http://localhost:${WEB_PORT}`,
    "  Вход:    без вход — само от този компютър",
    "",
    `  Задачи едновременно: ${slots} (MANDAT_WORKER_SLOTS=1..8)`,
    "  Демо агентите работят без ключ. За Claude Code и Codex: Ключове в менюто",
    "  (ключът отива само в проксито; не се записва никъде)",
    "  Спиране: Ctrl+C (базата остава; изтриване: docker rm -f mandat-local-db && docker volume rm mandat-local-db)",
    "",
  ];
}

/** D-302: what `pnpm local` needs, checked before anything is created; each line says what is wrong and what to do. */
export interface PreflightFacts { docker: string | null; cpus: number; node: string; git: string | null; freeGb: number; imagesPresent: boolean; webPortFree: boolean }
export function localPreflight(f: PreflightFacts): { ok: boolean; lines: string[] } {
  const out: { ok: boolean; text: string }[] = [];
  const add = (ok: boolean, text: string) => out.push({ ok, text });
  if (f.docker === null) add(false, "Docker не отговаря. Пусни Docker Desktop (или dockerd) и опитай пак.");
  else add(compareVersions(f.docker, "25.0.5") >= 0, compareVersions(f.docker, "25.0.5") >= 0 ? `Docker ${f.docker}` : `Docker ${f.docker} е стар: нужен е ≥ 25.0.5`);
  add(f.cpus >= 2, f.cpus >= 2 ? `${f.cpus} CPU за Docker` : `Docker вижда ${f.cpus} CPU; нужни са ≥ 2 (Docker Desktop: Settings → Resources)`);
  const major = Number(f.node.split(".")[0]);
  add(major === 24, major === 24 ? `Node ${f.node}` : `Node ${f.node}: нужен е Node 24 (brew install node@24 или nvm install 24)`);
  // D-380: git builds the demo repo and the export; on a Mac without Command Line Tools /usr/bin/git is only a stub
  add(f.git !== null, f.git !== null ? `git ${f.git}` : "git липсва: на Mac пусни xcode-select --install (Command Line Tools) и опитай пак");
  const need = f.imagesPresent ? 2 : 10;
  add(f.freeGb >= need, f.freeGb >= need ? `${f.freeGb} GB свободно място` : `${f.freeGb} GB свободно място; нужни са ≥ ${need} GB${f.imagesPresent ? "" : " за образите"} (docker system prune освобождава)`);
  add(f.webPortFree, f.webPortFree ? `порт ${WEB_PORT} е свободен` : `порт ${WEB_PORT} е зает: спри другото приложение (lsof -i :${WEB_PORT})`);
  return { ok: out.every((x) => x.ok), lines: out.map((x) => `${x.ok ? "✓" : "✗"} ${x.text}`) };
}

/** D-387: Docker that does not answer is waited for (one step line for the desktop window), every 3 s, up to ~10 min. */
export async function waitForDocker(o: { up: () => boolean; sleep: (ms: number) => Promise<void>; say: (s: string) => void; lang: Lang; tries?: number; signal?: AbortSignal }): Promise<boolean> {
  if (o.up()) return true;
  o.say(`${tt(o.lang, "local.waitDocker")}\n`);
  for (let i = 0; i < (o.tries ?? 200); i++) {
    if (o.signal?.aborted) return false;
    await o.sleep(3000);
    if (o.up()) return true;
  }
  return false;
}

/** D-387: what a line of `mandat images build` (stdout) or of BuildKit (stderr) says about the progress. */
export function imageEvent(line: string): { kind: "image" } | { kind: "step"; n: number; of: number } | null {
  if (/^\S+ (built|exists)$/.test(line.trim())) return { kind: "image" };
  const m = /^#\d+ \[(?:[\w.-]+ )?(\d+)\/(\d+)\]/.exec(line.trim());
  return m ? { kind: "step", n: Number(m[1]), of: Number(m[2]) } : null;
}

/** D-387: the [3/4] line the desktop window shows while the images build. */
export function imagesStep(p: { done: number; total: number; step: { n: number; of: number } | null; secs: number }, lang: Lang): string {
  const step = p.step ? tt(lang, "local.imageStep", { n: p.step.n, of: p.step.of }) : "";
  return tt(lang, "local.images", { k: Math.min(p.done + 1, p.total), n: p.total, step, min: Math.floor(p.secs / 60) });
}

/** The sandbox image needs the Debian mirrors only for the R14 probe tools; without them the build retries once with SANDBOX_APT=0 (D-151). */
export function retryWithoutApt(env: Record<string, string | undefined>): boolean {
  return env.MANDAT_SANDBOX_APT !== "0";
}

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
  });
}

async function gatherFacts(): Promise<PreflightFacts> {
  const v = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" });
  const up = v.status === 0;
  const cpus = up ? Number(spawnSync("docker", ["info", "--format", "{{.NCPU}}"], { encoding: "utf8" }).stdout.trim()) || 0 : 0;
  const t = await imageTags(repoRoot);
  const imagesPresent = up && [t.sandbox, t.gate, t.proxy].every((x) => spawnSync("docker", ["image", "inspect", x]).status === 0);
  let freeGb: number;
  try {
    const st = statfsSync(repoRoot);
    freeGb = Math.floor((st.bavail * st.bsize) / 1024 ** 3);
  } catch {
    freeGb = 0;
  }
  const g = spawnSync("git", ["--version"], { encoding: "utf8" });
  const git = g.status === 0 ? (/(\d+\.\d+(?:\.\d+)?)/.exec(g.stdout)?.[1] ?? "?") : null;
  return { docker: up ? v.stdout.trim() : null, cpus, node: process.versions.node, git, freeGb, imagesPresent, webPortFree: await portFree(WEB_PORT) };
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

/** D-387: `mandat images build` as a child; its output becomes one progress line (image k of n, the step, the minutes). */
function buildImages(io: Io, env: Record<string, string | undefined>, lang: Lang): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    const p = { done: 0, total: 3, step: null as { n: number; of: number } | null };
    const show = () => io.stderr(`${imagesStep({ ...p, secs: (Date.now() - started) / 1000 }, lang)}\n`);
    const read = (chunk: string) => {
      for (const line of chunk.split("\n")) {
        const e = imageEvent(line);
        if (e?.kind === "image") Object.assign(p, { done: p.done + 1, step: null });
        else if (e?.kind === "step") p.step = { n: e.n, of: e.of };
        if (e) show();
        if (/build failed/.test(line)) io.stderr(`${line}\n`);
      }
    };
    const child = spawn(process.execPath, [path.join(repoRoot, "packages/cli/dist/main.js"), "images", "build"], { env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8").on("data", read);
    child.stderr.setEncoding("utf8").on("data", read);
    show();
    const tick = setInterval(show, 15_000);
    child.on("error", () => (clearInterval(tick), resolve(false)));
    child.on("close", (code) => (clearInterval(tick), resolve(code === 0)));
  });
}

async function ensureImages(io: Io): Promise<boolean> {
  const t = await imageTags(repoRoot);
  if ([t.sandbox, t.gate, t.proxy].every((x) => docker(["image", "inspect", x]).status === 0)) return true;
  const env = Object.fromEntries(Object.entries(io.env).filter(([k]) => k !== "ANTHROPIC_API_KEY" && k !== "OPENAI_API_KEY"));
  const lang = cliLang(io.env);
  if (await buildImages(io, env, lang)) return true;
  if (retryWithoutApt(env)) {
    io.stderr("образи: строежът падна; пробвам пак без Debian огледалата (MANDAT_SANDBOX_APT=0)…\n");
    if (await buildImages(io, { ...env, MANDAT_SANDBOX_APT: "0" }, lang)) return true;
  }
  io.stderr("образи: не станаха. Зад фирмен прокси: MANDAT_EXTRA_CA_CERTS=/път/до/ca.pem pnpm local\n");
  return false;
}

export async function localCommand(io: Io, o: { home: string; dbPort: number; signal?: AbortSignal }): Promise<number> {
  io.stderr("[1/4] проверка на компютъра\n");
  // D-387: Docker that is not running yet is waited for, so the person can start it instead of starting over
  const up = () => spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], { encoding: "utf8" }).status === 0;
  await waitForDocker({ up, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), say: io.stderr, lang: cliLang(io.env), ...(o.signal ? { signal: o.signal } : {}) });
  const pre = localPreflight(await gatherFacts());
  for (const l of pre.lines) io.stderr(`      ${l}\n`);
  if (!pre.ok) return 3;
  io.stderr("[2/4] база и демо репо\n");
  if (!ensureDb(io, o.dbPort)) return 3;
  const url = localDbUrl(o.dbPort);
  const db = await connect(url);
  if (!db) {
    io.stderr("база: не отговаря след 60 s\n");
    return 3;
  }
  try {
    await migrate(io, db);
    const fx = buildFixture({ repoRoot, mandatHome: o.home, force: false, name: "demo-shop" });
    await seedLocal(db, { remoteUrl: `file://${path.resolve(fx.mirror)}` });
  } finally {
    await db.end();
  }
  io.stderr("[3/4] образи на пясъчника\n");
  if (!(await ensureImages(io))) return 3;
  io.stderr("[4/4] прокси, уеб интерфейс и worker\n");

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
  // E7в (AC-3.8): the sealed keys survive a restart; a proxy that came back locked (its boot token is spent) is recreated
  const fromStore = async () => {
    if (!hasSealedKeys(o.home) || !(await proxyLocked(host.proxyAdminPort))) return;
    io.stderr("прокси: пускам със запазените ключове…\n");
    await proxyStart({ ...io, stdout: () => undefined, env: clean }, deps, { mandatHome: o.home, host, json: true, force: true });
  };
  if (!fromEnv) await fromStore();
  const healer = setInterval(() => void fromStore().catch(() => undefined), 30_000);
  healer.unref();
  const control = await startControl({
    start: startProxy,
    stop: async () => void (await proxyStop({ ...io, stdout: () => undefined }, deps, { json: true, port: host.proxyAdminPort })),
    providers: () => proxyProviders(deps),
    accounts: () => listAccounts(deps),
    login: new LoginSessions(loginDeps(deps)),
    logout: (name) => logoutProfile(deps, name),
    system: new SystemJobs({ run: cliRun(localJobEnv(clean, url)), org: DEMO_ORG_ID }),
  });
  const env = localWebEnv(clean, { dbUrl: url, control });
  // `pnpm local` builds first (pnpm build); the production server is faster than `next dev` and has no dev overlay.
  const web = spawn(process.execPath, localWebArgs(localWebBin(repoRoot)), { cwd: path.join(repoRoot, "apps/web"), env, stdio: ["ignore", "ignore", "inherit"] });
  const stop = new AbortController();
  const onSig = () => stop.abort();
  process.once("SIGINT", onSig);
  process.once("SIGTERM", onSig);
  o.signal?.addEventListener("abort", onSig);
  web.on("exit", onSig);

  const slots = slotsFrom(io.env.MANDAT_WORKER_SLOTS, 2);
  io.stdout(localBanner(slots).join("\n") + "\n");
  try {
    return await workerCommand({ ...io, env: { ...clean, MANDAT_DB_URL: url } }, { home: o.home, once: false, signal: stop.signal, slots });
  } finally {
    clearInterval(healer);
    web.kill("SIGTERM");
    await control.close();
  }
}
