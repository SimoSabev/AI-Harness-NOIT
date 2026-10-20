import { Command, CommanderError, Option } from "commander";
import { contractSeal, contractShowAgent } from "./commands/contract.js";
import { verifyLog } from "./commands/verify-log.js";
import { doctor } from "./commands/doctor.js";
import { imagesBuild } from "./commands/images.js";
import { fixturesBuild } from "./commands/fixtures.js";
import { runCommand } from "./commands/run.js";
import { benchCommand, redteamCommand } from "./commands/bench.js";
import { proxyStart, proxyStatus, proxyStop } from "./commands/proxy.js";
import { verifyAlias } from "./commands/verify.js";
import { ladderSim } from "./commands/ladder.js";
import { realDeps } from "./deps.js";
import type { CliDeps } from "./deps.js";
import { MandatError, exitCodeOf } from "@mandat/contract";
import { hostConfig } from "@mandat/worker";
import { mandatHome } from "./paths.js";
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
    .addOption(new Option("--org <org>", "organisation").choices(["o_local"]).default("o_local"))
    .option("--json", "machine output")
    .action((o: { ledger?: string; org: "o_local"; json?: boolean }) => {
      const g = globals();
      const ledger = o.ledger ?? path.join(mandatHome({ home: g.home, env: io.env }), "ledger.jsonl");
      code = verifyLog(io, { ledger, org: o.org, json: Boolean(o.json ?? g.json) });
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
    .action(async (o: { deep?: boolean; keep?: boolean; json?: boolean }) => {
      code = await doctor(io, deps(), { mandatHome: home(), host: hostConfig(io.env), deep: Boolean(o.deep), keep: Boolean(o.keep), json: json(o) });
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
    .requiredOption("--agent <agent>", "claude | fake:<scenario>")
    .option("--keep", "keep the Docker volumes")
    .option("--json", "machine output (progress on stderr)")
    .action(async (o: { contract: string; agent: string; keep?: boolean; json?: boolean }) => {
      code = await runCommand(io, { mandatHome: home(), contract: o.contract, agent: o.agent, keep: Boolean(o.keep), json: json(o), ...(depsIn ? { docker: depsIn.docker } : {}) });
    });

  const list = (v: string | undefined): string[] | undefined => (v === undefined ? undefined : v.split(",").map((s) => s.trim()).filter(Boolean));
  program
    .command("bench")
    .description("run the 8 bench scenarios (9.6)")
    .option("--only <ids>", "e.g. B1,B5")
    .option("--json", "machine output")
    .action(async (o: { only?: string; json?: boolean }) => {
      const only = list(o.only);
      if (only && only.some((x) => !/^B[1-8]$/.test(x))) throw new MandatError("E_USAGE", `unknown scenario in --only: ${o.only}`);
      code = await benchCommand(io, { mandatHome: home(), json: json(o), ...(only ? { only } : {}), ...(depsIn ? { docker: depsIn.docker } : {}) });
    });
  program
    .command("redteam")
    .description("run the E0 red team: R5, R6, R8, R14 (8.7)")
    .option("--only <ids>", "e.g. R5,R14")
    .option("--json", "machine output")
    .action(async (o: { only?: string; json?: boolean }) => {
      const only = list(o.only);
      if (only && only.some((x) => !["R5", "R6", "R8", "R14"].includes(x))) throw new MandatError("E_USAGE", `unknown attack in --only: ${o.only}`);
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
