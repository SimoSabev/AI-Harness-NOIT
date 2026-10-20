#!/usr/bin/env node
// D-065: the repository never loads .env files. Looks only for (1) string literals naming a .env file and
// (2) `dotenv` in import/require or package.json dependencies, under packages/** and apps/**.
// `process.env` is NOT a hit. Allowlist: ".env.test*" in packages/core/**/*.test.ts and fixtures/contracts/**.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_LITERAL = /["'`](?:[^"'`]*\/)?\.env(?:\.[\w.*-]+)?["'`]/g;
const DOTENV_IMPORT = /(?:\bimport\b[^;\n]*|\brequire\s*\()\s*["'`][^"'`]*\bdotenv\b/;
const SCAN_EXT = new Set([".ts", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json"]);

/** @param {string} rel POSIX path relative to the repo */
function allowEnvTest(rel) {
  return /^packages\/core\/.*\.test\.ts$/.test(rel) || rel.startsWith("fixtures/contracts/");
}

/**
 * @param {{ path: string, content: string }[]} files POSIX paths relative to the repo
 * @returns {string[]} violations "path:line: reason"
 */
export function scanForDotenv(files) {
  const out = [];
  for (const f of files) {
    if (path.posix.basename(f.path) === "package.json") {
      const pkg = JSON.parse(f.content);
      for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
        for (const name of Object.keys(pkg[field] ?? {})) {
          if (/\bdotenv\b/.test(name)) out.push(`${f.path}: dependency ${name}`);
        }
      }
      continue;
    }
    f.content.split("\n").forEach((line, i) => {
      for (const m of line.matchAll(ENV_LITERAL)) {
        const inner = m[0].slice(1, -1);
        if (path.posix.basename(inner).startsWith(".env.test") && allowEnvTest(f.path)) continue;
        out.push(`${f.path}:${i + 1}: .env literal ${m[0]}`);
      }
      if (DOTENV_IMPORT.test(line)) out.push(`${f.path}:${i + 1}: dotenv import`);
    });
  }
  return out;
}

/** @param {string} dir absolute */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "coverage") continue;
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walk(abs));
    else if (SCAN_EXT.has(path.extname(name))) out.push(abs);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const roots = ["packages", "apps"].map((d) => path.join(repo, d)).filter((d) => {
    try {
      return statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
  const files = roots.flatMap(walk).map((abs) => ({ path: path.relative(repo, abs).split(path.sep).join("/"), content: readFileSync(abs, "utf8") }));
  const v = scanForDotenv(files);
  if (v.length === 0) {
    console.log(`no-dotenv ok (${files.length} files)`);
  } else {
    for (const x of v) console.error(x);
    process.exit(1);
  }
}
