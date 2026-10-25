#!/usr/bin/env node
import { runAction } from "./action.js";

// The step of action.yml: inputs come as INPUT_* env (set explicitly by the composite action), the verdict goes to the job.
process.exitCode = await runAction(process.env, { stdout: (s) => process.stdout.write(s), stderr: (s) => process.stderr.write(s) });
