#!/usr/bin/env node
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { parseMcpArgs } from "./args.js";
import { inProcessBackend, socketBackend } from "./backend.js";
import { JobRunner, spawnVerifyProcess } from "./jobs.js";
import { createMandatServer } from "./server.js";

// stdout is JSON-RPC only; every log line goes to stderr.
const p = parseMcpArgs(process.argv.slice(2), process.env);
if (!p.ok) {
  process.stderr.write(`mandat-mcp: ${p.error}\n`);
  process.exit(2);
}
const a = p.args;
const verifyBin = path.join(path.dirname(fileURLToPath(import.meta.resolve("@mandat/verify"))), "main.js");
const inproc = a.sameUid || (!existsSync(a.socket) && process.env.MANDAT_VERIFYD_INPROC === "1");
let backend;
if (inproc) {
  process.stderr.write("mandat-mcp: same uid as the agent — advice only, no isolation (VERIFIED is shown as UNKNOWN INFRA:same_uid)\n");
  const home = a.home ?? path.join(os.homedir(), ".mandat-mcp");
  backend = inProcessBackend(new JobRunner({ home, sameUid: true, spawnVerify: spawnVerifyProcess(verifyBin) }), a.allowed);
} else {
  backend = socketBackend(a.socket);
}
serveStdio(() => createMandatServer(backend), { onerror: (e) => process.stderr.write(`mandat-mcp: ${e.message}\n`) });
