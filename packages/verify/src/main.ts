#!/usr/bin/env node
import { mandatVerify } from "./cli.js";

const code = await mandatVerify(process.argv.slice(2), {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  env: process.env,
  cwd: process.cwd(),
});
process.exitCode = code;
