#!/usr/bin/env node
import { runCli } from "./cli.js";

process.exitCode = await runCli(process.argv, {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  env: process.env,
  cwd: process.cwd(),
});
