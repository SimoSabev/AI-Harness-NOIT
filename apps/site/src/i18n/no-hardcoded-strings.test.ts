import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// E9g B (D-377, AC-12.10): every visible string of the site is in src/i18n/en.ts + bg.ts; Cyrillic elsewhere fails.
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED = [/\.test\.tsx?$/, /^i18n\/(en|bg)\.ts$/];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("no hard-coded site strings (E9g B)", () => {
  it("no Cyrillic in apps/site/src outside the catalog and the tests", () => {
    const out: string[] = [];
    for (const file of walk(src)) {
      const rel = path.relative(src, file).split(path.sep).join("/");
      if (!/\.(tsx?|css)$/.test(rel) || ALLOWED.some((a) => a.test(rel))) continue;
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (/[Ѐ-ӿ]/.test(line)) out.push(`${rel}:${i + 1}`);
      });
    }
    expect(out).toEqual([]);
  });
});
