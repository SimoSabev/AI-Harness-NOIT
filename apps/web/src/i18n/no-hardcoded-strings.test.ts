import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// E7е (AC-12.10): every user-visible string lives in the catalog (src/i18n/en.ts, bg.ts). A Cyrillic letter anywhere
// else under apps/web/src (text node, attribute, constant or comment) fails. Allowed: tests.
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CYRILLIC = /[\u0400-\u04FF]/;
const ALLOWED = [/\.test\.tsx?$/, /\.test-helper\.ts$/, /^i18n\/(en|bg)\.ts$/];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function hardcoded(root: string): string[] {
  const out: string[] = [];
  for (const file of walk(root)) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    if (!/\.tsx?$/.test(rel) || ALLOWED.some((a) => a.test(rel))) continue;
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (CYRILLIC.test(line)) out.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  return out;
}

describe("no hard-coded UI strings (E7е, AC-12.10)", () => {
  it("no Cyrillic in apps/web/src outside the catalog and the tests", () => {
    expect(hardcoded(src)).toEqual([]);
  });
  it("the scanner finds a Cyrillic string and respects the allowlist", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "i18n-scan-"));
    mkdirSync(path.join(dir, "lib"));
    mkdirSync(path.join(dir, "i18n"));
    writeFileSync(path.join(dir, "page.tsx"), 'export const A = <h1>Tasks</h1>;\nexport const B = <p title="\u0417\u0430\u0434\u0430\u0447\u0438">x</p>;\n');
    writeFileSync(path.join(dir, "i18n", "bg.ts"), "export const bg = { a: \"\u0410\" };\n");
    writeFileSync(path.join(dir, "x.test.ts"), "// \u0442\u0435\u0441\u0442\n");
    writeFileSync(path.join(dir, "notes.md"), "\u0431\u0435\u043b\u0435\u0436\u043a\u0438\n");
    expect(hardcoded(dir)).toEqual([expect.stringMatching(/^page\.tsx:2: /)]);
  });
});
