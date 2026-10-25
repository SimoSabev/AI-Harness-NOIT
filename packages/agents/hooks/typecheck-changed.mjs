#!/usr/bin/env node
// PostToolUse: the profile's typecheck command after an edit (v5 E8а).
import { runChanged } from "./_changed.mjs";

await runChanged("typecheck");
process.exit(0);
