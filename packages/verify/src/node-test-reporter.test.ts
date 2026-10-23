import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseVitestReport } from "@mandat/contract";

// E8и (D-358): `node --test` with the harness reporter writes the vitest JSON shape (file, ancestors, title, status),
// so the same parser, D1, D2 and MUST_PASS work; the reporter has no dependencies and ships in the sandbox image.
const reporter = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../reporters/node-test.mjs");

describe("node --test reporter (E8и)", () => {
  it("два файла, вложени describe, pass/fail/skip/todo → vitest-json; id-тата са по файл", () => {
    const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "mandat-node-test-"))); // macOS: tmpdir is a symlink
    mkdirSync(path.join(root, "tests"));
    writeFileSync(path.join(root, "tests", "cart.test.mjs"), [
      'import { describe, it } from "node:test";',
      'import assert from "node:assert/strict";',
      'describe("cart", () => {',
      '  it("adds", () => assert.equal(1 + 1, 2));',
      '  it("fails", () => assert.equal(1, 2));',
      '  describe("nested", () => { it("deep", () => {}); it.skip("skipped", () => {}); it.todo("later"); });',
      "});",
      'it("top level", () => {});',
    ].join("\n"));
    writeFileSync(path.join(root, "tests", "money.test.mjs"), 'import { test } from "node:test";\ntest("adds", () => {});\n');
    const out = path.join(root, "report.json");
    try {
      execFileSync(process.execPath, ["--test", `--test-reporter=${reporter}`, `--test-reporter-destination=${out}`], { cwd: root, stdio: "ignore" });
    } catch {
      /* a failing test exits 1 */
    }
    const r = parseVitestReport(readFileSync(out, "utf8"), root);
    expect(r.valid).toBe(true);
    if (!r.valid) return;
    expect(r.success).toBe(false);
    expect(Object.fromEntries(r.tests)).toEqual({
      "tests/cart.test.mjs > cart > adds": "passed",
      "tests/cart.test.mjs > cart > fails": "failed",
      "tests/cart.test.mjs > cart > nested > deep": "passed",
      "tests/cart.test.mjs > cart > nested > skipped": "skipped",
      "tests/cart.test.mjs > cart > nested > later": "todo",
      "tests/cart.test.mjs > top level": "passed",
      "tests/money.test.mjs > adds": "passed",
    });
    rmSync(root, { recursive: true, force: true });
  });
});
