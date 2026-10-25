#!/usr/bin/env node
// E9g B step 7 (D-378): the real UI screenshots of the docs site (apps/site/public/shots), in English and Bulgarian, in
// the dark and the light theme. The screens are listed once, in apps/site/shots.json.
//
//   pnpm build && node scripts/site-shots.mjs                       # default: a disposable database with the demo seed
//   node scripts/site-shots.mjs --url http://127.0.0.1:3000         # against a running `pnpm local`
//
// Default mode: the same web server `pnpm local` runs (`next start` of apps/web, the local owner instead of a login,
// D-368) on its own port, against a throw-away database `mandat_shots` on the local Postgres (127.0.0.1:54329, the
// container `pnpm local` starts) with the demo seed (tasks, verdicts) and the labelled sample (apps/web/src/lib/sample.ts).
// Why not the database of `pnpm local`: it holds the person's own tasks and repos, which must not end up in images
// committed to the repo. The web server gets no API key and no KEK; nothing is sent anywhere.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SiteShotList } from "../packages/contract/dist/index.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SHOT_LANGS = /** @type {const} */ (["en", "bg"]);
export const SHOT_THEMES = /** @type {const} */ (["dark", "light"]);
const SHOTS_PORT = 3210;
const DEFAULT_DB = "postgresql://postgres:postgres@127.0.0.1:54329/mandat_shots";

/** @param {string} name @param {string} lang @param {string} theme */
export function shotFile(name, lang, theme) {
  return `${name}-${lang}-${theme}.png`;
}

/** @param {{ name: string, route: string }[]} shots */
export function shotPlan(shots) {
  return shots.flatMap((s) => {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.name)) throw new Error(`site-shots: bad name ${s.name}`);
    if (!s.route.startsWith("/") || s.route.startsWith("//")) throw new Error(`site-shots: route must be a local path: ${s.route}`);
    return SHOT_LANGS.flatMap((lang) => SHOT_THEMES.map((theme) => ({ name: s.name, route: s.route, lang, theme, file: shotFile(s.name, lang, theme) })));
  });
}

/** The throw-away database: only a name that starts with mandat_shots is ever dropped. @param {string} url */
export function safeDbName(url) {
  const name = new URL(url).pathname.slice(1);
  if (!/^mandat_shots[a-z0-9_]*$/.test(name)) throw new Error(`site-shots: refusing to reset database ${name}`);
  return name;
}

/**
 * The web server's env: PATH and HOME, the database and the local owner (D-368). No API key, no KEK, no dev login.
 * @param {Record<string, string | undefined>} env @param {{ dbUrl: string, owner: string }} o
 */
export function shotsWebEnv(env, o) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of ["PATH", "HOME"]) if (env[k] !== undefined) out[k] = /** @type {string} */ (env[k]);
  return { ...out, MANDAT_DB_URL: o.dbUrl, MANDAT_LOCAL_OWNER: o.owner, NEXT_TELEMETRY_DISABLED: "1" };
}

/** @param {string[]} argv @returns {{ url: string | undefined, out: string | undefined }} */
export function parseArgs(argv) {
  /** @type {{ url: string | undefined, out: string | undefined }} */
  const o = { url: undefined, out: undefined };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const key = flag === "--url" ? "url" : flag === "--out" ? "out" : null;
    if (!key) throw new Error(`site-shots: unknown argument ${flag}`);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new Error(`site-shots: ${flag} needs a value`);
    if (key === "url" && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?\/?$/.test(v)) throw new Error(`site-shots: --url must be a loopback address (the local harness): ${v}`);
    o[key] = v;
  }
  return o;
}

const webRequire = createRequire(path.join(repo, "apps/web/package.json"));

async function freshDatabase(url) {
  const pg = webRequire("pg");
  const name = safeDbName(url);
  const admin = new pg.Client({ connectionString: url.replace(/\/[^/]+$/, "/postgres") });
  try {
    await admin.connect();
  } catch {
    throw new Error("site-shots: the local Postgres (127.0.0.1:54329) does not answer. Start it once with `pnpm local`, or pass --url.");
  }
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();
  const drop = async () => {
    const a = new pg.Client({ connectionString: url.replace(/\/[^/]+$/, "/postgres") });
    await a.connect();
    await a.query(`drop database if exists ${name} with (force)`);
    await a.end();
  };
  const c = new pg.Client({ connectionString: url });
  try {
    await c.connect();
    await c.query(readFileSync(path.join(repo, "supabase/shim/supabase-shim.sql"), "utf8"));
    for (const f of readdirSync(path.join(repo, "supabase/migrations")).filter((x) => x.endsWith(".sql")).sort()) await c.query(readFileSync(path.join(repo, "supabase/migrations", f), "utf8"));
    const { seedDemo, DEMO_OWNER_ID } = await import(pathToFileURL(path.join(repo, "apps/worker/dist/index.js")).href);
    // the demo accounts get throw-away secrets: the shots log in as the local owner, never with these
    const b32 = () => [...randomBytes(32)].map((b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[b % 32]).join("");
    await seedDemo({ query: async (text, params) => ({ rows: (await c.query(text, params)).rows }) }, { remoteUrl: "file:///tmp/demo-shop.git", password: () => randomBytes(18).toString("base64url"), totpSecret: b32 });
    return { owner: DEMO_OWNER_ID, drop };
  } catch (e) {
    await c.end().catch(() => undefined);
    await drop();
    throw e;
  } finally {
    await c.end().catch(() => undefined);
  }
}

async function waitFor(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url, { redirect: "manual" });
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`site-shots: ${url} did not answer in ${ms / 1000} s`);
}

async function shoot(base, outDir) {
  const list = SiteShotList.parse(JSON.parse(readFileSync(path.join(repo, "apps/site/shots.json"), "utf8")));
  const { chromium } = webRequire("@playwright/test");
  const browser = await chromium.launch(process.env.MANDAT_CHROMIUM ? { executablePath: process.env.MANDAT_CHROMIUM } : {});
  mkdirSync(outDir, { recursive: true });
  try {
    for (const lang of SHOT_LANGS) {
      for (const theme of SHOT_THEMES) {
        const context = await browser.newContext({ viewport: list.viewport, deviceScaleFactor: 1, colorScheme: theme, reducedMotion: "reduce" });
        await context.addCookies(["theme", "lang", "sample"].map((n) => ({ name: n, value: n === "theme" ? theme : n === "lang" ? lang : "1", url: base })));
        const page = await context.newPage();
        for (const p of shotPlan(list.shots).filter((x) => x.lang === lang && x.theme === theme)) {
          await page.goto(new URL(p.route, base).href, { waitUntil: "networkidle" });
          await page.evaluate(() => document.fonts.ready);
          await page.screenshot({ path: path.join(outDir, p.file), animations: "disabled" });
          console.log(`site-shots: ${p.file}`);
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = parseArgs(process.argv.slice(2));
  const outDir = a.out ? path.resolve(a.out) : path.join(repo, "apps/site/public/shots");
  if (a.url) {
    await shoot(a.url, outDir);
  } else {
    const dbUrl = process.env.MANDAT_SHOTS_DB_URL ?? DEFAULT_DB;
    const db = await freshDatabase(dbUrl);
    const next = webRequire.resolve("next/dist/bin/next");
    const web = spawn(process.execPath, [next, "start", "-p", String(SHOTS_PORT), "-H", "127.0.0.1"], { cwd: path.join(repo, "apps/web"), env: shotsWebEnv(process.env, { dbUrl, owner: db.owner }), stdio: ["ignore", "ignore", "inherit"] });
    try {
      const base = `http://127.0.0.1:${SHOTS_PORT}`;
      await waitFor(`${base}/`, 60_000);
      await shoot(base, outDir);
    } finally {
      web.kill("SIGTERM");
      await db.drop();
    }
  }
}
