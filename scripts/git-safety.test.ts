import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// T3-7 / S16 (демо промпт т. 3.4): no destructive git outside Mandat-owned trees; refs after --end-of-options.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function sources(): { file: string; lines: string[] }[] {
  const out: { file: string; lines: string[] }[] = [];
  for (const base of ["packages", "apps"]) {
    for (const pkg of readdirSync(path.join(repo, base))) {
      const src = path.join(repo, base, pkg, "src");
      if (!existsSync(src)) continue;
      for (const f of readdirSync(src, { recursive: true, encoding: "utf8" })) {
        const abs = path.join(src, f);
        if (!/\.(ts|mjs|js)$/.test(f) || /\.test(-helper)?\.ts$|\.test-helper\.ts$|testing\.ts$/.test(f) || !statSync(abs).isFile()) continue;
        out.push({ file: path.relative(repo, abs), lines: readFileSync(abs, "utf8").split("\n") });
      }
    }
  }
  return out;
}

const DESTRUCTIVE = /--hard\b|["']checkout["'],\s*["']-f["']|checkout -f\b|["']clean["'],\s*["']-f|clean -f/;
const REF_CMDS = /["'](fetch|ls-remote|merge-base|rev-parse|show|cat-file|update-ref|checkout|log|diff)["']/;

export function destructiveHits(files: { file: string; lines: string[] }[]): string[] {
  return files.flatMap((f) => f.lines.flatMap((l, k) => (DESTRUCTIVE.test(l) && !/\/\/ T3-7: mandat-owned /.test(l) ? [`${f.file}:${k + 1}`] : [])));
}
/** A git argv line with an interpolated ref (`${…}`) must carry --end-of-options; SHAs checked by regex are exempt. */
export function refHits(files: { file: string; lines: string[] }[]): string[] {
  return files.flatMap((f) =>
    f.lines.flatMap((l, k) => (REF_CMDS.test(l) && /\$\{/.test(l) && /\[/.test(l) && !/--end-of-options|\/\/ T3-7: sha/.test(l) ? [`${f.file}:${k + 1}`] : [])),
  );
}

describe("git-safety (T3-7)", () => {
  it("правилата хващат нарушения", () => {
    const bad = [{ file: "x.ts", lines: ['git(["reset", "--hard", base]);', 'run(["checkout", "-f", sha]);', 'run(["fetch", "-q", url, `${ref}:x`]);', 'run(["reset", "--hard", d]); // T3-7: mandat-owned <home>/mirrors'] }];
    expect(destructiveHits(bad)).toEqual(["x.ts:1", "x.ts:2"]);
    expect(refHits(bad)).toEqual(["x.ts:3"]);
  });
  it("0 разрушителни git извиквания в packages/ и apps/", () => {
    expect(destructiveHits(sources())).toEqual([]);
  });
  it("интерполиран ref → --end-of-options (или SHA, проверен по regex)", () => {
    expect(refHits(sources())).toEqual([]);
  });
  it("огледалата на verify пишат refs с core.fsync", () => {
    const tb = readFileSync(path.join(repo, "packages/verify/src/trusted-base.ts"), "utf8");
    expect(tb).toContain('"core.fsync=objects,reference"');
    for (const l of tb.split("\n").filter((x) => /"(fetch|update-ref)"/.test(x))) expect(l, l).toContain("...FSYNC");
  });
});
