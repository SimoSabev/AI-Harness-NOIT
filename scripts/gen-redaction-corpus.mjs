#!/usr/bin/env node
// Generates fixtures/redaction/corpus.json deterministically (seeded PRNG). None of these keys is real (D-095, D-125).
// Each key is stored as fragments ("parts") that tests join at runtime, so no file in the repository contains a
// complete key-shaped literal (GitHub push protection and gitleaks would flag them; D-095, D-149).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let state = 0x4d414e44; // "MAND"
function rand() {
  // mulberry32
  state = (state + 0x6d2b79f5) | 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const B64URL = ALNUM + "-_";
const UPPER_DIGIT = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const gen = (n, alphabet = ALNUM) => Array.from({ length: n }, () => alphabet[Math.floor(rand() * alphabet.length)]).join("");
const b64url = (s) => Buffer.from(s).toString("base64url");

const keys = [];
/** Split so that no fragment matches a provider pattern on its own: prefix | body (| JWT segments). */
function split(kind, value) {
  if (kind === "jwt") return value.split(/(?=\.)/);
  if (kind === "entropy") return [value.slice(0, 20), value.slice(20)];
  const m = /^(sk-ant-[a-z0-9]+-|sk-[A-Za-z0-9]+-|gh[pousr]_|sb_secret_|AKIA|xox[baprs]-|mdt_)/.exec(value);
  if (!m) throw new Error(`no prefix for ${kind}`);
  return [m[1], value.slice(m[1].length)];
}
const add = (kind, value) => {
  const parts = split(kind, value);
  if (parts.join("") !== value) throw new Error("split lost data");
  keys.push({ kind, parts });
};
for (const v of ["api03", "api03", "api03", "oat01", "oat01", "admin01", "admin01", "api03"]) add("anthropic", ["sk", "ant", v, gen(40, B64URL)].join("-"));
for (let i = 0; i < 6; i++) add("openai", ["sk", i % 2 ? "proj" : gen(4)].join("-") + "-" + gen(40, B64URL));
for (const p of ["ghp", "gho", "ghu", "ghs", "ghr", "ghp", "ghs", "ghp"]) add("github", `${p}_${gen(36)}`);
for (let i = 0; i < 4; i++) add("supabase", `sb_secret_${gen(36, B64URL)}`);
for (let i = 0; i < 6; i++) add("aws", `AKIA${gen(16, UPPER_DIGIT)}`);
for (const p of ["xoxb", "xoxa", "xoxp", "xoxr", "xoxs"]) add("slack", `${p}-${gen(10, "0123456789")}-${gen(12, "0123456789")}-${gen(24)}`);
for (let i = 0; i < 5; i++) add("jwt", `${b64url('{"alg":"HS256","typ":"JWT"}')}.${b64url(JSON.stringify({ sub: gen(12), iat: 1792454400 + i }))}.${gen(43, B64URL)}`);
for (let i = 0; i < 4; i++) {
  const claims = { t: "t_fix_discount", r: `r_01JB8Z3K4M5N6P7Q8R9S0T1V${gen(2, "0123456789ABCDEFGHJKMNPQRSTVWXYZ")}`, a: 1, e: 1792458000, b: 2, n: gen(16, "0123456789abcdef") };
  add("mandat_token", `mdt_${b64url(JSON.stringify(claims))}.${gen(42, B64URL)}${gen(1, ALNUM)}`);
}
for (let i = 0; i < 4; i++) add("entropy", gen(40, ALNUM + "+"));
if (keys.length !== 50) throw new Error(`expected 50 keys, got ${keys.length}`);

const falsePositives = [
  "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
  "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "3f2c9a1e-7b4d-4c8e-9a6f-0d1e2f3a4b5c",
  "sha512-+5GARMH0vX8a+o8xGrmx67KH+aDI5aYVO2qFustRhUJrSMdxzb4LtUmF2rL+PyaxCpHfXYZz38vfIuT2irg/Cg==",
  ".mandat/runs/r_01JB8Z3K4M5N6P7Q8R9S0T1V2W/verdict.json",
  "mandat-sandbox:cc2.1.302-1a2b3c4d5e6f",
  "se_01JB8Z3K4M5N6P7Q8R9S0T1V2W",
  "node_modules/@vitest/coverage-v8/dist/index.js",
  "tests/cart.spec.ts > cart > applies 10% over 50",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-5-5",
  "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1",
  "const DISCOUNT_THRESHOLD_CENTS = 50000;",
  "getUserAccountSettingsHandler",
  "packages/egress-gate/src/npm-allowlist.ts",
  "https://registry.npmjs.org/@vitest/expect/-/expect-5.0.5.tgz",
  "The quick brown fox jumps over the lazy dog while the build runs.",
  "mandat-net-r_01JB8Z3K4M5N6P7Q8R9S0T1V2W-agent",
  "npm ci --ignore-scripts --no-audit --no-fund",
  "--append-system-prompt-file /m/in/contract.txt",
  "Bash(npx vitest *)",
  "task-description-for-the-shopping-cart-fixture",
  "AWS_SECRET_ACCESS_KEY",
];
if (falsePositives.length !== 22) throw new Error("expected 22 false positives");

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
writeFileSync(path.join(repo, "fixtures/redaction/corpus.json"), JSON.stringify({ seed: "0x4d414e44", keys, false_positives: falsePositives }, null, 2) + "\n");
console.log("wrote fixtures/redaction/corpus.json");
