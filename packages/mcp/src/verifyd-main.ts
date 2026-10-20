#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMcpArgs } from "./args.js";
import { JobRunner, spawnVerifyProcess } from "./jobs.js";
import { startVerifyd } from "./verifyd.js";

// `mandat-verifyd --allow <abs> --remote <url> [...] --home /var/lib/mandat-verify --socket /run/mandat/verifyd.sock`
// Runs as the OS user `mandat` (docs/setup/verifyd.md). Same argument rules as mandat-mcp.
const p = parseMcpArgs(process.argv.slice(2), process.env);
if (!p.ok || !p.args.home) {
  process.stderr.write(`mandat-verifyd: ${p.ok ? "--home is required" : p.error}\n`);
  process.exit(2);
}
const verifyBin = path.join(path.dirname(fileURLToPath(import.meta.resolve("@mandat/verify"))), "main.js");
const runner = new JobRunner({ home: p.args.home, sameUid: false, spawnVerify: spawnVerifyProcess(verifyBin) });
await startVerifyd({ socket: p.args.socket, runner, allowed: p.args.allowed });
process.stderr.write(`mandat-verifyd: listening on ${p.args.socket}\n`);
