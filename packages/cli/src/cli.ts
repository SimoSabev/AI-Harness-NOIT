import { Command, CommanderError, Option } from "commander";
import { contractSeal, contractShowAgent } from "./commands/contract.js";
import { verifyLog } from "./commands/verify-log.js";
import { mandatHome } from "./paths.js";
import type { Io } from "./output.js";
import path from "node:path";

/** Runs the CLI in-process and returns the exit code (D-026, D-128). Usage errors → 2. */
export async function runCli(argv: string[], io: Io): Promise<number> {
  let code = 0;
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

  try {
    await program.parseAsync(argv);
  } catch (e) {
    if (e instanceof CommanderError) {
      return e.code === "commander.helpDisplayed" || e.code === "commander.version" || e.code === "commander.help" ? 0 : 2;
    }
    throw e;
  }
  return code;
}
