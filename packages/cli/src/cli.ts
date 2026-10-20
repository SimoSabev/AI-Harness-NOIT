import { Command, CommanderError, Option } from "commander";
import { contractSeal, contractShowAgent } from "./commands/contract.js";
import { verifyLog } from "./commands/verify-log.js";
import { doctor } from "./commands/doctor.js";
import { imagesBuild } from "./commands/images.js";
import { fixturesBuild } from "./commands/fixtures.js";
import { proxyStart, proxyStatus, proxyStop } from "./commands/proxy.js";
import { realDeps } from "./deps.js";
import type { CliDeps } from "./deps.js";
import { MandatError, exitCodeOf } from "@mandat/contract";
import { hostConfig } from "@mandat/worker";
import { mandatHome } from "./paths.js";
import type { Io } from "./output.js";
import path from "node:path";

/** Runs the CLI in-process and returns the exit code (D-026, D-128). Usage errors → 2. */
export async function runCli(argv: string[], io: Io, depsIn?: CliDeps): Promise<number> {
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
    .command("fixtures")
    .description("build the deterministic demo repository mirror")
    .command("build")
    .option("--force", "recreate the mirror if its base_commit differs")
    .action((o: { force?: boolean }) => {
      code = fixturesBuild(io, { mandatHome: home(), force: Boolean(o.force) });
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
