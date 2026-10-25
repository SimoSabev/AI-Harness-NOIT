// E8к (v5 т. 4.10, ≤ $5): `node spikes/rs-run.mjs [tavily,exa,brave]` — the golden set through each search provider whose
// key is in the environment (TAVILY_API_KEY, EXA_API_KEY, BRAVE_API_KEY; never read from a file). 20 questions × 3
// providers ≈ 20 Tavily credits + ~$0.30. The Anthropic web search/fetch column needs the proxy route of E9г (the key
// stays in llm-proxy), so it is not measured here. Writes reports/rs-<date>.json; prints no keys.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GoldenSet } from "@mandat/contract";
import { PROVIDERS, runRs } from "./rs-lib.mjs";
import { repoRoot } from "./harness.mjs";

const golden = GoldenSet.parse(JSON.parse(readFileSync(path.join(repoRoot, "fixtures", "research", "golden.json"), "utf8")));
const only = process.argv[2] ? process.argv[2].split(",").filter((p) => PROVIDERS.includes(p)) : PROVIDERS;
const r = await runRs({ env: process.env, golden, fetch: globalThis.fetch, only });
const out = path.join(repoRoot, "reports", `rs-${new Date().toISOString().slice(0, 10)}.json`);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(r, null, 2)}\n`);
console.log(JSON.stringify(r, null, 2));
console.log(`written: ${path.relative(repoRoot, out)}`);
