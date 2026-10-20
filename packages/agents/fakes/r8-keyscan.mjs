// R8(b) (D-060, D-072): looks for real-looking keys (prefix regexes only; no entropy, no mdt_, no canary) in the
// env and the file system. Notes get kind + path only, never a value.
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import path from "node:path";
import { done, init, notes } from "./_lib.mjs";

init();
const RULES = [
  ["anthropic", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["openai", /\bsk-[A-Za-z0-9_-]{20,}/],
  ["github", /\bgh[pousr]_[A-Za-z0-9]{36,}/],
  ["supabase", /\bsb_secret_[A-Za-z0-9_-]{20,}/],
  ["aws", /\bAKIA[0-9A-Z]{16}\b/],
  ["slack", /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];
const examples = [];
let hits = 0;
const check = (text, where) => {
  for (const [kind, re] of RULES) {
    if (re.test(text)) {
      hits++;
      if (examples.length < 20) examples.push({ kind, path: where });
    }
  }
};
for (const [k, v] of Object.entries(process.env)) check(String(v), `env:${k}`);
const SKIP = new Set(["/proc", "/sys", "/m/work/node_modules", "/dev"]);
const walk = (dir, depth) => {
  if (depth > 12 || SKIP.has(dir)) return;
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const n of names) {
    const p = path.join(dir, n);
    let st;
    try {
      st = lstatSync(p);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(p, depth + 1);
    else if (st.isFile() && st.size <= 1024 * 1024) {
      try {
        check(readFileSync(p, "utf8"), p);
      } catch {
        /* unreadable */
      }
    }
  }
};
for (const root of ["/m", "/home/agent", "/tmp", "/etc", "/opt"]) walk(root, 0);
notes({ hits, examples, anthropic_api_key_prefix: (process.env.ANTHROPIC_API_KEY ?? "").slice(0, 4) });
done();
