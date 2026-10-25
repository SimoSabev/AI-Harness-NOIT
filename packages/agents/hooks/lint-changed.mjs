#!/usr/bin/env node
// PostToolUse: the profile's lint command on the changed file (v5 E8а).
import { runChanged } from "./_changed.mjs";

await runChanged("lint");
process.exit(0);
