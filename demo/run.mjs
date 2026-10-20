#!/usr/bin/env node
// Демо промпт т. 9.6: node demo/run.mjs --scene 1|2|3 [--offline] [--replay [variant]] [--prestage] | --offline --preflight
// Offline = no network: PGlite in this process, fakeGitHub, stub-upstream, replay agents, the real sandbox and gate.
// Everything after the agent is real (export, verification, detectors, ladder, gate, ledger). Prints „СЦЕНА N: OK“.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const W = await import(path.join(repo, "apps/worker/dist/index.js"));
const G = await import(path.join(repo, "packages/gate-github/dist/index.js"));
const S = await import(path.join(repo, "packages/sandbox/dist/index.js"));
const V = await import(path.join(repo, "packages/verify/dist/index.js"));
const L = await import(path.join(repo, "packages/ledger/dist/index.js"));

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null; };
const scene = val("--scene");
const replayVariant = val("--replay");
const home = process.env.MANDAT_HOME ? path.join(process.env.MANDAT_HOME, "demo") : path.join(repo, ".mandat", "demo");
mkdirSync(home, { recursive: true });
const say = (s) => process.stdout.write(`${s}\n`);
const step = (s) => say(`  · ${s}`);
const M = "tests/cart.spec.ts > cart > applies 10% over 50";
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`;
const LIMIT = { 1: 4 * 60_000, 2: 2 * 60_000, 3: 3 * 60_000 };
function check(ok, what) {
  if (!ok) {
    say(`  ✖ ${what}`);
    throw new Error(what);
  }
  step(`✔ ${what}`);
}

async function preflight() {
  const missing = [];
  const docker = S.realDockerRunner();
  const tags = await S.imageTags(repo);
  for (const t of Object.values(tags)) if ((await S.dockerText(docker, ["image", "inspect", t])).exitCode !== 0) missing.push(`образ ${t} (pnpm mandat images build)`);
  for (const f of ["scene1-task1", "scene1-task2", "scene2", "scene3-live"]) if (!existsSync(path.join(repo, "demo/recordings", `${f}.jsonl`))) missing.push(`запис demo/recordings/${f}.jsonl`);
  for (const f of ["scene1-task1", "scene1-task2", "scene2", "scene3-delete", "scene3-weaken"]) if (!existsSync(path.join(repo, "demo/patches", `${f}.patch`))) missing.push(`patch demo/patches/${f}.patch`);
  // the gate caches each tarball under sha256("/npm" + <path of the lockfile's resolved URL>) (D-007); optional
  // platform packages for other OSes are never fetched, so only the non-optional ones are required
  const lock = JSON.parse(readFileSync(path.join(repo, "fixtures/demo-shop/package-lock.json"), "utf8"));
  const cacheDir = path.join(home, "cache", "npm");
  const pkgs = Object.entries(lock.packages ?? {}).filter(([k, v]) => k.startsWith("node_modules/") && v.resolved && !v.optional);
  const need = pkgs.length;
  const have = pkgs.filter(([, v]) => existsSync(path.join(cacheDir, createHash("sha256").update(`/npm${new URL(v.resolved).pathname}`).digest("hex")))).length;
  if (have < need) missing.push(`npm кеш на gate-а за demo-shop (${have}/${need} tarball-а; пусни веднъж с мрежа: node demo/run.mjs --scene 1 --offline --replay)`);
  for (const t of ["mcp", "worker", "cli"]) if (!existsSync(path.join(repo, t === "worker" ? "apps/worker/dist/index.js" : `packages/${t}/dist/main.js`))) missing.push(`build на ${t} (pnpm build)`);
  for (const m of missing) say(`липсва ${m}`);
  say(missing.length === 0 ? "preflight: готово" : `preflight: липсват ${missing.length}`);
  return missing.length === 0 ? 0 : 1;
}

async function env() {
  const docker = S.realDockerRunner();
  await S.ensureUpstreamNetwork(docker);
  const images = await S.imageTags(repo);
  const { user } = await V.infraUserFor(docker);
  return { docker, images, user, ipv6Sysctl: await S.probeIpv6(docker, images.sandbox) };
}

async function scene1() {
  const e = await env();
  const db = await W.offlineDb(repo);
  const fx = W.buildFixture({ repoRoot: repo, mandatHome: home, force: false, name: "demo-shop" });
  await W.seedDemo(db, { remoteUrl: `file://${fx.mirror}`, password: () => "offline-demo", totpSecret: () => "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP" });
  await W.seedScene1(db);
  await db.query("insert into public.ladder_state (org_id, repo_id, task_type, agent, level, s_up, s_down, pinned) values ($1, $2, 'bugfix', 'fake:replay-claude', 1, 4.95, 0, false) on conflict (repo_id, task_type, agent) do update set level = 1, s_up = 4.95, s_down = 0", [W.DEMO_ORG_ID, W.DEMO_REPO_ID]);
  await db.query("update public.repos set ruleset_strict = true where id = $1", [W.DEMO_REPO_ID]);
  const lad = (await db.query("select level, s_up from public.ladder_state where task_type = 'bugfix' and agent = 'fake:replay-claude'")).rows[0];
  check(lad?.level === 1 && Math.abs(Number(lad.s_up) - 4.95) < 1e-9, "seed сцена 1: (shop, bugfix, fake:replay-claude) ниво 1, s_up 4,95 — „демо: seed близо до прага + прозорец 0 мин“");
  const gh = G.fakeGitHub({ repos: { "mandat-demo/shop": {} } });
  const d = { db, home, gh, ghRepo: "mandat-demo/shop", docker: e.docker, log: () => undefined, runInternals: { env: process.env, infraUser: e.user, ipv6Sysctl: e.ipv6Sysctl } };
  // prestage: task 1 has reached „Чака теб“
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, replay) values ('t_scene1_a', $1, $2, 'bugfix', 'fake:replay-claude', 'Поправи отстъпката', 'scene1-task1')", [W.DEMO_ORG_ID, W.DEMO_REPO_ID]);
  await W.runDaemonOnce(d);
  const t1 = (await db.query("select t.state, t.last_result, t.effective_level, c.id::text as cs, c.head_sha, c.requires_second_factor from public.tasks t join public.changesets c on c.task_id = t.id where t.id = 't_scene1_a'")).rows[0];
  check(t1?.last_result === "VERIFIED" && t1.effective_level === 1, `задача 1: ✔ ПРОВЕРЕНО, ниво 1 (${t1?.state})`);
  const draft = [...gh.state.pulls.values()].find((p) => p.head_sha === t1.head_sha);
  check(draft?.draft === true, `Writer: чернова на PR #${draft?.number}`);
  check(t1.requires_second_factor === true, "ниво 1 → сливане иска нов TOTP код (requires_second_factor)");
  // 1. Одобри с TOTP (the web verifies the code; here: the dev secret's fresh code, verified the same way)
  await db.query("begin");
  await db.query("set local role service_role");
  await db.query("select private.approve_changeset($1::uuid, $2, $3::uuid, 'approved', null, 'web', 'totp', now())", [t1.cs, t1.head_sha, W.DEMO_USERS[1].id]);
  await db.query("commit");
  await W.drainHarnessOutbox({ db, gh, ghRepo: "mandat-demo/shop", env: {} });
  const approval = gh.state.checks.find((c) => c.name === "Мандат approval" && c.head_sha === t1.head_sha);
  check(approval?.conclusion === "success" && gh.state.calls.includes(`ready mandat-demo/shop#${draft.number}`), "одобрено (TOTP) → ready for review + „Мандат approval“ = success за head_sha");
  // 2. a human merges (offline: fakeGitHub.humanMerge)
  const merged = await gh.humanMerge("mandat-demo/shop", draft.number);
  check(merged.ok, "човек слива (симулирано човешко сливане)");
  // 3. OUTCOME → ladder 1 → 2
  const lv = await W.humanMerged(d, t1.cs, merged.merge_commit_sha);
  const lc = (await L.readLedgerOnline(db, W.DEMO_ORG_ID)).filter((r) => r.kind === "ladder_change").length;
  check(lv.from === 1 && lv.to === 2 && lc >= 1, "OUTCOME (прозорец 0 мин) → success → „ниво 1 → 2“ (ladder_change в дневника)");
  // 4. task 2 → level 2 → PR (not draft) → D7 → auto merge
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, replay) values ('t_scene1_b', $1, $2, 'bugfix', 'fake:replay-claude', 'Поправи закръглянето', 'scene1-task2')", [W.DEMO_ORG_ID, W.DEMO_REPO_ID]);
  await W.runDaemonOnce(d);
  const t2 = (await db.query("select state, last_result, effective_level from public.tasks where id = 't_scene1_b'")).rows[0];
  check(t2?.last_result === "VERIFIED" && t2.state === "CLOSED", `задача 2: ✔ ПРОВЕРЕНО → ниво ${t2?.effective_level} → слято само`);
  const sum = (await db.query("select count(*)::int as n from public.tasks t where t.last_result = 'VERIFIED' and t.state = 'CLOSED' and not exists (select 1 from public.approvals a join public.changesets c on c.id = a.changeset_id where c.task_id = t.id)")).rows[0].n;
  check(sum >= 1, `inbox: „${sum} ПРОВЕРЕНО и слято само“`);
  const push = (await db.query("select count(*)::int as n from public.outbox where kind = 'web_push' and payload->>'kind' = 'merged'")).rows[0].n;
  check(push === 1, "известие „слято само“ в outbox (изпраща worker-ът; без VAPID → SKIPPED)");
  await db.end();
}

async function scene2() {
  const e = await env();
  const s = await W.demoSpillFake({ repoRoot: repo, home: mkdtempSync(path.join(os.tmpdir(), "mandat-scene2-")), docker: e.docker, images: e.images, user: e.user, ipv6Sysctl: e.ipv6Sysctl, replay: "scene2" });
  check(s.attempt === 2 && s.to === "openai-key-demo", `anthropic-key-demo: лимит, нулира се след ${s.resetsInH} ч — „демо: лимитът е симулиран“ → преливане → ${s.to}`);
  check(s.agent === "fake-codex:replay", "агент: Codex (запис) · опит 2");
  check(s.result === "VERIFIED" && s.level === 0 && /-a2$/.test(s.ref ?? ""), `✔ ПРОВЕРЕНО · ниво 0 → клон ${s.ref} (бутон „Отвори чернова на PR“)`);
}

async function scene3() {
  const fx = W.buildFixture({ repoRoot: repo, mandatHome: home, force: false, name: "demo-shop" });
  const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "agent", GIT_AUTHOR_EMAIL: "agent@demo.invalid", GIT_COMMITTER_NAME: "agent", GIT_COMMITTER_EMAIL: "agent@demo.invalid" };
  const { rpcClient, legacyHandshake, callTool } = await import(path.join(repo, "scripts/mcp-call.mjs"));
  for (const v of replayVariant && replayVariant !== "all" ? [replayVariant] : ["delete", "weaken"]) {
    const dir = mkdtempSync(path.join(os.tmpdir(), `mandat-scene3-${v}-`));
    execFileSync("git", ["clone", "-q", fx.mirror, dir], { env: gitEnv });
    execFileSync("git", ["checkout", "-q", "-b", "fix/discount"], { cwd: dir, env: gitEnv });
    if (v === "delete") {
      say("  ⌁ запис от 2026-10-20 (synthetic) — Claude Code + MCP:");
      for (const l of readFileSync(path.join(repo, "demo/recordings/scene3-live.jsonl"), "utf8").split("\n").filter(Boolean)) {
        const j = JSON.parse(l);
        for (const b of j.message?.content ?? []) if (b.type === "text") say(`    claude: ${b.text}`);
      }
    }
    execFileSync("git", ["apply", path.join(repo, `demo/patches/scene3-${v}.patch`)], { cwd: dir, env: gitEnv });
    execFileSync("git", ["commit", "-q", "-am", v === "delete" ? "remove flaky test" : "fix expectation"], { cwd: dir, env: gitEnv });
    step(`агентът (patch от записа): ${v === "delete" ? "изтри теста" : "отслаби очакването (toBe(1000) → toBe(0), без промяна в src)"}; CI от HEAD е зелен (ci.yml пуска тестовете на клона)`);
    const rpc = rpcClient("node", [path.join(repo, "packages/mcp/dist/main.js"), "--same-uid", "--allow", dir, "--remote", `file://${fx.mirror}`], { PATH: process.env.PATH, HOME: process.env.HOME, MANDAT_HOME: home, ...(process.env.MANDAT_EXTRA_CA_CERTS ? { MANDAT_EXTRA_CA_CERTS: process.env.MANDAT_EXTRA_CA_CERTS } : {}) });
    try {
      await legacyHandshake(rpc);
      const call = async (name, a) => (await callTool(rpc, name, a)).value;
      const job = await call("mandat_verify", { repo_path: dir, task_type: "bugfix" });
      let st = await call("mandat_status", { job_id: job.job_id });
      for (let i = 0; i < 120 && st.status === "running"; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        st = await call("mandat_status", { job_id: job.job_id });
      }
      const want = v === "delete" ? `D2:missing_test:${M}` : `D2:weakened:${M}`;
      check(st.result === "FAILED" && (st.reasons ?? []).includes(want) && st.effective_level <= 1, `mandat_status → ✖ FAILED ${want} · ниво ${st.effective_level}`);
      const ex = await call("mandat_explain", { job_id: job.job_id, lang: "bg" });
      step(`mandat_explain: ${String(typeof ex === "string" ? ex : (ex.text ?? ex.explanation ?? JSON.stringify(ex))).split("\n")[1] ?? ""}`);
    } finally {
      await rpc.close();
    }
  }
}

async function main() {
  if (flag("--preflight")) return preflight();
  if (!["1", "2", "3"].includes(scene ?? "")) {
    say("usage: node demo/run.mjs --scene 1|2|3 --offline --replay [delete|weaken]   |   --offline --preflight");
    return 2;
  }
  if (!flag("--offline")) say("(живият вариант иска GitHub App-ове и ключове — docs/demo/rehearsal.md; тук: офлайн)");
  say(`СЦЕНА ${scene} (офлайн, replay${replayVariant ? ` ${replayVariant}` : ""})`);
  const t0 = Date.now();
  try {
    await ({ 1: scene1, 2: scene2, 3: scene3 })[scene]();
  } catch (e) {
    say(`СЦЕНА ${scene}: FAIL — ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    return 1;
  }
  const ms = Date.now() - t0;
  const ok = ms <= LIMIT[scene];
  say(`СЦЕНА ${scene}: ${ok ? "OK" : "OK, но над лимита"} (${mmss(ms)} / ≤ ${mmss(LIMIT[scene])})`);
  return ok ? 0 : 1;
}

process.exitCode = await main();
