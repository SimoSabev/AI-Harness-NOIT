import { Command, CommanderError } from "commander";
import { contractSeal, contractShowAgent } from "./commands/contract.js";
import { verifyLog, verifyLogOnline } from "./commands/verify-log.js";
import { applyLocal } from "./commands/apply.js";
import { ATTACKS } from "@mandat/bench";
import { doctor } from "./commands/doctor.js";
import { imagesBuild } from "./commands/images.js";
import { fixturesBuild } from "./commands/fixtures.js";
import { runCommand } from "./commands/run.js";
import { benchCommand, failGateCommand, redteamCommand } from "./commands/bench.js";
import { proxyStart, proxyStatus, proxyStop } from "./commands/proxy.js";
import { verifyAlias } from "./commands/verify.js";
import { initCommand } from "./commands/init.js";
import { ladderSim } from "./commands/ladder.js";
import { anchorCommand } from "./commands/anchor.js";
import { demoExportRepo, demoExternalPr, demoSeed, demoSpill } from "./commands/demo.js";
import { workerCommand } from "./commands/worker.js";
import { tuiCommand } from "./commands/tui.js";
import { localCommand } from "./commands/local.js";
import { accountsCommand, loginCommand, logoutCommand } from "./commands/accounts.js";
import { realDeps } from "./deps.js";
import type { CliDeps } from "./deps.js";
import { MandatError, exitCodeOf } from "@mandat/contract";
import { dbUrl, hostConfig, openDb, runBaseline } from "@mandat/worker";
import { mandatHome, repoRoot } from "./paths.js";
import type { Io } from "./output.js";
import path from "node:path";

/** Runs the CLI in-process and returns the exit code (D-026, D-128). Usage errors → 2. */
export async function runCli(argv: string[], io: Io, depsIn?: CliDeps): Promise<number> {
  // `mandat [--home <dir>] verify …` → the mandat-verify process (D-238); its flags pass through untouched.
  const rest = argv.slice(2);
  const vi = rest.indexOf("verify");
  if (vi >= 0 && rest.slice(0, vi).every((a, k, xs) => a === "--home" || xs[k - 1] === "--home" || a === "--json")) {
    const pre = rest.slice(0, vi);
    const h = pre.includes("--home") ? pre[pre.indexOf("--home") + 1] : io.env.MANDAT_HOME;
    const args = rest.slice(vi + 1);
    if (pre.includes("--json") && !args.includes("--json")) args.push("--json");
    return verifyAlias(io, args, h ? { home: path.resolve(io.cwd, h) } : { home: mandatHome({ home: undefined, env: io.env }) });
  }
  let code = 0;
  let cached: CliDeps | undefined = depsIn;
  const deps = (): CliDeps => (cached ??= realDeps());
  const program = new Command("mandat")
    .description("Mandat: task → agent in a Docker sandbox → safe export → verdict → ledger")
    .option("--home <dir>", "MANDAT_HOME (default <repo>/.mandat)")
    .option("--json", "machine output: exactly one JSON line on stdout")
    .exitOverride()
    .configureOutput({ writeOut: (s) => io.stdout(s), writeErr: (s) => io.stderr(s) })
    .showHelpAfterError();
  const globals = (): { home?: string; json?: boolean } => program.opts<{ home?: string; json?: boolean }>();

  program
    .command("verify-log")
    .description("verify the hash chain of the ledger")
    .option("--ledger <path>", "ledger file (default <MANDAT_HOME>/ledger.jsonl)")
    .option("--org <org>", "o_local (file ledger) or an org uuid (Postgres, MANDAT_DB_URL)", "o_local")
    .option("--json", "machine output")
    .action(async (o: { ledger?: string; org: string; json?: boolean }) => {
      const g = globals();
      if (o.org !== "o_local") {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(o.org)) throw new MandatError("E_USAGE", `--org must be o_local or a uuid: ${o.org}`);
        code = await verifyLogOnline(io, { org: o.org, json: Boolean(o.json ?? g.json), db: depsIn?.db ?? openDb(dbUrl(io.env)) });
        return;
      }
      const ledger = o.ledger ?? path.join(mandatHome({ home: g.home, env: io.env }), "ledger.jsonl");
      code = verifyLog(io, { ledger, org: "o_local", json: Boolean(o.json ?? g.json) });
    });

  // E8g (D-356, AC-9.3): bring Mandat's branch for a task into your working copy (merge --ff-only; it never overwrites your work)
  program
    .command("apply")
    .description("merge Mandat's branch for a task into your working copy with --ff-only (refuses on divergence or local changes)")
    .requiredOption("--task <id>", "task id (t_…)")
    .option("--repo <path>", "your working copy", ".")
    .option("--mirror <path>", "Mandat's mirror of the repo (default: from the task's repo in MANDAT_DB_URL)")
    .action(async (o: { task: string; repo: string; mirror?: string }) => {
      const g = globals();
      let mirror = o.mirror;
      if (!mirror) {
        const db = depsIn?.db ?? openDb(dbUrl(io.env));
        const r = (await db.query<{ remote_url: string }>("select r.remote_url from public.tasks t join public.repos r on r.id = t.repo_id where t.id = $1", [o.task])).rows[0];
        mirror = r?.remote_url.startsWith("file://") ? r.remote_url.slice(7) : undefined;
        if (!mirror) throw new MandatError("E_USAGE", "this task's repo has no local mirror; pass --mirror");
      }
      const r = await applyLocal({ mirror, repo: path.resolve(o.repo), taskId: o.task });
      if (g.json ?? false) io.stdout(JSON.stringify(r) + "\n");
      else io.stdout(r.ok ? `applied ${r.ref} (${r.files.length} file(s)): fast-forward to ${r.head.slice(0, 12)}\n` : `not applied: ${r.reason}${r.detail ? ` — ${r.detail}` : ""}\n`);
      code = r.ok ? 0 : 3;
    });

  const contract = program.command("contract").description("seal or inspect a task contract");
  contract
    .command("seal <file>")
    .description("fill config_hash and contract_hash")
    .action((file: string) => {
      code = contractSeal(io, file);
    });
  contract
    .command("show-agent <file>")
    .description("print the contract exactly as the agent sees it")
    .action((file: string) => {
      code = contractShowAgent(io, file);
    });

  const home = (): string => mandatHome({ home: globals().home, env: io.env });
  const json = (o: { json?: boolean }): boolean => Boolean(o.json ?? globals().json);

  program
    .command("doctor")
    .description("check the prerequisites (2), images and the proxy; --deep runs the R14 probes")
    .option("--deep", "run r14-netprobe in a temporary sandbox")
    .option("--keep", "keep the temporary run directory")
    .option("--json", "machine output")
    .option("--report", "an anonymous JSON report (no paths, user name or IPs) for docs/setup (E7ж)")
    .action(async (o: { deep?: boolean; keep?: boolean; json?: boolean; report?: boolean }) => {
      code = await doctor(io, deps(), { mandatHome: home(), host: hostConfig(io.env), deep: Boolean(o.deep), keep: Boolean(o.keep), json: json(o), report: Boolean(o.report) });
    });

  program
    .command("images")
    .description("build the local images")
    .command("build")
    .option("--force", "docker build --no-cache even if the tag exists")
    .action(async (o: { force?: boolean }) => {
      code = await imagesBuild(io, deps(), { force: Boolean(o.force), host: hostConfig(io.env) });
    });

  program
    .command("run")
    .description("run one task: agent in a sandbox → export → verify → verdict → ledger")
    .requiredOption("--contract <file>", "sealed contract JSON")
    .requiredOption("--agent <agent>", "claude | fake:<scenario> | fake-codex:<scenario>")
    .option("--profile <file>", "harness profile JSON: compiled into the agent's control layer (E8а)")
    .option("--keep", "keep the Docker volumes")
    .option("--json", "machine output (progress on stderr)")
    .action(async (o: { contract: string; agent: string; keep?: boolean; json?: boolean; profile?: string }) => {
      code = await runCommand(io, { mandatHome: home(), contract: o.contract, agent: o.agent, keep: Boolean(o.keep), json: json(o), ...(o.profile ? { profile: o.profile } : {}), ...(depsIn ? { docker: depsIn.docker } : {}) });
    });

  const list = (v: string | undefined): string[] | undefined => (v === undefined ? undefined : v.split(",").map((s) => s.trim()).filter(Boolean));
  program
    .command("bench")
    .description("run the 8 bench scenarios (9.6)")
    .option("--only <ids>", "e.g. B1,B5")
    .option("--fail-gate", "B1 with a broken verifier: must NOT be VERIFIED (exit 1 = caught, T3-3)")
    .option("--json", "machine output")
    .action(async (o: { only?: string; json?: boolean; failGate?: boolean }) => {
      if (o.failGate) {
        code = await failGateCommand(io, { mandatHome: home(), json: json(o), ...(depsIn ? { docker: depsIn.docker } : {}) });
        return;
      }
      const only = list(o.only);
      if (only && only.some((x) => !/^B[1-8]$/.test(x))) throw new MandatError("E_USAGE", `unknown scenario in --only: ${o.only}`);
      code = await benchCommand(io, { mandatHome: home(), json: json(o), ...(only ? { only } : {}), ...(depsIn ? { docker: depsIn.docker } : {}) });
    });
  program
    .command("redteam")
    .description("run the red team: R5, R6, R8, R14 (E0) and R15–R20 (v5 E8h)")
    .option("--only <ids>", "e.g. R5,R14")
    .option("--json", "machine output")
    .action(async (o: { only?: string; json?: boolean }) => {
      const only = list(o.only);
      if (only && only.some((x) => !Object.keys(ATTACKS).includes(x))) throw new MandatError("E_USAGE", `unknown attack in --only: ${o.only}`);
      code = await redteamCommand(io, { mandatHome: home(), json: json(o), ...(only ? { only } : {}), ...(depsIn ? { docker: depsIn.docker } : {}) });
    });

  program
    .command("fixtures")
    .description("build the deterministic demo repository mirror")
    .command("build")
    .option("--force", "recreate the mirror if its base_commit differs")
    .option("--name <name>", "shop (E0, default) or demo-shop")
    .action((o: { force?: boolean; name?: string }) => {
      code = fixturesBuild(io, { mandatHome: home(), force: Boolean(o.force), ...(o.name ? { name: o.name } : {}) });
    });

  const proxy = program.command("proxy").description("the LLM proxy (the only holder of ANTHROPIC_API_KEY)");
  proxy
    .command("start")
    .option("--json", "machine output")
    .action(async (o: { json?: boolean }) => {
      code = await proxyStart(io, deps(), { mandatHome: home(), host: hostConfig(io.env), json: json(o) });
    });
  proxy
    .command("stop")
    .option("--json", "machine output")
    .action(async (o: { json?: boolean }) => {
      code = await proxyStop(io, deps(), { json: json(o), port: hostConfig(io.env).proxyAdminPort });
    });
  proxy
    .command("status")
    .option("--json", "machine output")
    .action(async (o: { json?: boolean }) => {
      code = await proxyStatus(io, deps(), { json: json(o), port: hostConfig(io.env).proxyAdminPort });
    });

  program
    .command("init")
    .description("propose .mandat.yml for a local repo (scanner without AI; never approves): writes .mandat.yml.proposed")
    .requiredOption("--repo <dir>", "repository directory")
    .option("--json", "machine output")
    .option("--baseline", "run the tests of the tree twice in the sandbox (Docker) and propose with the baseline (E7г)")
    .option("--profile", "also write the full harness profile (8 layers) to .mandat/profile.proposed.json (E8б)")
    .action(async (o: { repo: string; json?: boolean; baseline?: boolean; profile?: boolean }) => {
      code = await initCommand(io, { repo: o.repo, json: json(o), baseline: o.baseline === true, profile: o.profile === true, runBaseline: (dir, policy) => runBaseline(dir, policy, { mandatHome: home(), repoRoot, env: io.env }) });
    });
  program
    .command("ladder")
    .description("trust ladder tools")
    .command("sim")
    .description("mean number of tasks until the first promotion (spec т. 7: ≈ 87)")
    .requiredOption("--p <p>", "success probability")
    .option("--h <h>", "h_up threshold (default 5)")
    .option("--runs <n>", "simulations (default 10000)")
    .option("--seed <n>", "PRNG seed (default 1)")
    .option("--json", "machine output")
    .action((o: { p: string; h?: string; runs?: string; seed?: string; json?: boolean }) => {
      code = ladderSim(io, { ...o, json: json(o) });
    });
  program
    .command("anchor")
    .description("RFC 3161 timestamp of the last ledger hash (TSA_URLS)")
    .option("--org <org>", "o_local or an org uuid (Postgres)", "o_local")
    .option("--json", "machine output")
    .action(async (o: { org: string; json?: boolean }) => {
      if (o.org !== "o_local" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(o.org)) throw new MandatError("E_USAGE", `--org must be o_local or a uuid`);
      code = await anchorCommand(io, { home: home(), org: o.org, json: json(o), ...(o.org !== "o_local" ? { db: depsIn?.db ?? openDb(dbUrl(io.env)) } : {}), ...(depsIn?.tsaFetcher ? { fetcher: depsIn.tsaFetcher } : {}) });
    });
  program
    .command("worker")
    .description("the online worker (MANDAT_MODE=worker): takes CREATED tasks from Postgres")
    .option("--once", "process at most one task and exit")
    .action(async (o: { once?: boolean }) => {
      code = await workerCommand(io, { home: home(), once: Boolean(o.once) });
    });
  // D-295: subscription accounts (one profile volume per account)
  program
    .command("login")
    .description("sign in to a Claude subscription account (Anthropic's own flow, in your terminal)")
    .option("--name <name>", "a short name for this account (a-z, 0-9, -)", "default")
    .action(async (o: { name: string }) => {
      code = await loginCommand(io, deps(), { name: o.name });
    });
  program
    .command("accounts")
    .description("the signed-in subscription accounts")
    .option("--json", "machine output")
    .action(async (o: { json?: boolean }) => {
      code = await accountsCommand(io, deps(), { json: json(o) });
    });
  program
    .command("logout")
    .description("sign out of a subscription account and remove its profile")
    .requiredOption("--name <name>", "the account name")
    .action(async (o: { name: string }) => {
      code = await logoutCommand(io, deps(), { name: o.name });
    });
  program
    .command("local")
    .description("everything on this machine: Postgres in Docker, the web UI on :3000 and the worker (D-292)")
    .option("--db-port <port>", "the local Postgres port on 127.0.0.1", "54329")
    .action(async (o: { dbPort: string }) => {
      const dbPort = Number(o.dbPort);
      if (!Number.isInteger(dbPort) || dbPort < 1024 || dbPort > 65535) throw new MandatError("E_USAGE", "--db-port must be 1024..65535");
      code = await localCommand(io, { home: home(), dbPort });
    });
  // D-306: the start page in the terminal
  program
    .command("tui")
    .description("the dashboard in the terminal: flow, swarm, one pane per project (read-only; q quits)")
    .option("--db-port <port>", "the local Postgres port on 127.0.0.1", "54329")
    .option("--once", "print one frame and exit (no colour)")
    .action(async (o: { dbPort: string; once?: boolean }) => {
      const dbPort = Number(o.dbPort);
      if (!Number.isInteger(dbPort) || dbPort < 1024 || dbPort > 65535) throw new MandatError("E_USAGE", "--db-port must be 1024..65535");
      code = await tuiCommand(io, { dbPort, once: Boolean(o.once) });
    });
  const demo = program.command("demo").description("demo data and scenes");
  demo
    .command("external-pr")
    .option("--fake", "fakeGitHub + local sandbox (no network)")
    .option("--json", "machine output")
    .action(async (o: { fake?: boolean; json?: boolean }) => {
      code = await demoExternalPr(io, { home: home(), fake: Boolean(o.fake), json: json(o), docker: depsIn?.docker ?? deps().docker });
    });
  demo
    .command("export-repo")
    .description("a ready git repository of demo-shop for GITHUB_DEMO_REPO (you push it yourself)")
    .requiredOption("--out <dir>", "empty target directory")
    .option("--json", "machine output")
    .action((o: { out: string; json?: boolean }) => {
      code = demoExportRepo(io, { home: home(), out: o.out, json: json(o) });
    });
  demo
    .command("spill")
    .description("scene 2 offline: Anthropic 429 → spill → OpenAI channel, fake Codex (т. 8.3)")
    .option("--fake", "stub upstream + test proxy + fake agents (no network)")
    .option("--json", "machine output")
    .action(async (o: { fake?: boolean; json?: boolean }) => {
      code = await demoSpill(io, { home: home(), fake: Boolean(o.fake), json: json(o), docker: depsIn?.docker ?? deps().docker });
    });
  demo
    .command("seed")
    .option("--minimal", "demo org + owner + repo (E1б)")
    .option("--scene <n>", "scene 1: (shop, bugfix, claude) near the threshold (т. 9.2)")
    .option("--json", "machine output")
    .action(async (o: { minimal?: boolean; scene?: string; json?: boolean }) => {
      code = await demoSeed(io, { home: home(), minimal: Boolean(o.minimal), ...(o.scene !== undefined ? { scene: o.scene } : {}), json: json(o), db: depsIn?.db ?? openDb(dbUrl(io.env)) });
    });
  program.command("verify").description("alias of mandat-verify (Apache-2.0), run as a separate process");

  try {
    await program.parseAsync(argv);
  } catch (e) {
    if (e instanceof CommanderError) {
      return e.code === "commander.helpDisplayed" || e.code === "commander.version" || e.code === "commander.help" ? 0 : 2;
    }
    if (e instanceof MandatError) {
      io.stderr(`${e.code}: ${e.message}\n`);
      return exitCodeOf(e.code);
    }
    throw e;
  }
  return code;
}
