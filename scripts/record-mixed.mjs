#!/usr/bin/env node
// D-113: records fixtures/vitest-reports/mixed.json from a REAL vitest 5.0.5 run with .skip, .todo and .only.
// The temporary project lives exactly in /tmp/mandat-mixed (removed before and after); CI is unset so .only is allowed.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = "/tmp/mandat-mixed";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(repo, "fixtures/vitest-reports/mixed.json");

const files = {
  "package.json": JSON.stringify({ name: "mandat-mixed", private: true, type: "module", devDependencies: { vitest: "5.0.5" } }, null, 2) + "\n",
  "vitest.config.ts": 'import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { include: ["tests/**/*.spec.ts"] } });\n',
  "tests/plain.spec.ts": [
    'import { describe, expect, it } from "vitest";',
    'describe("plain", () => {',
    '  it("passes", () => { expect(1).toBe(1); });',
    '  it.skip("skipped one", () => { expect(1).toBe(2); });',
    '  it.todo("todo one");',
    "});",
    "",
  ].join("\n"),
  "tests/only.spec.ts": [
    'import { describe, expect, it } from "vitest";',
    'describe("only", () => {',
    '  it.only("focused", () => { expect(1).toBe(1); });',
    '  it("not focused", () => { expect(1).toBe(1); });',
    "});",
    "",
  ].join("\n"),
};

rmSync(DIR, { recursive: true, force: true });
try {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(DIR, rel)), { recursive: true });
    writeFileSync(path.join(DIR, rel), content);
  }
  const env = { ...process.env };
  delete env.CI;
  execFileSync("npm", ["install", "--before=2026-10-17", "--registry=https://registry.npmjs.org/", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: DIR, env, stdio: "inherit" });
  const report = path.join(DIR, "report.json");
  try {
    execFileSync("npx", ["vitest", "run", "--reporter=json", `--outputFile=${report}`], { cwd: DIR, env, stdio: "inherit" });
  } catch {
    // A non-zero exit is fine as long as the report exists; it is validated below.
  }
  const json = JSON.parse(readFileSync(report, "utf8"));
  for (const tr of json.testResults) tr.name = "/m/work/" + path.posix.relative(DIR, tr.name);
  writeFileSync(out, JSON.stringify(json, null, 2) + "\n");
  console.log(`wrote ${path.relative(repo, out)} (${json.numTotalTests} tests)`);
} finally {
  rmSync(DIR, { recursive: true, force: true });
}
