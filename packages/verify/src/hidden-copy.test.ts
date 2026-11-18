import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeHiddenTests } from "./hidden-copy.js";

// D-536: hidden test files go into a tree at their path from the repo root (a __hidden__ folder at any depth), so they
// sit where the project's runner discovers tests; a legacy set (D-362) joins its directory.
const tree = () => mkdtempSync(path.join(os.tmpdir(), "mandat-hidden-copy-"));
const file = (p: string) => ({ path: p, data: Buffer.from(`// ${p}\n`) });

describe("writeHiddenTests (D-536)", () => {
  it("an oracle's nested files land at their repo-root paths and come back as the paths that count for D5", () => {
    const d = tree();
    const r = writeHiddenTests(d, { dir: "", files: [file("packages/engine/test/__hidden__/vec3.spec.ts"), file("tests/__hidden__/u.spec.ts")] });
    expect(r).toEqual({ ok: true, paths: ["packages/engine/test/__hidden__/vec3.spec.ts", "tests/__hidden__/u.spec.ts"] });
    expect(readFileSync(path.join(d, "packages/engine/test/__hidden__/vec3.spec.ts"), "utf8")).toBe("// packages/engine/test/__hidden__/vec3.spec.ts\n");
  });
  it("a legacy set joins its directory", () => {
    const d = tree();
    expect(writeHiddenTests(d, { dir: "tests/__hidden__", files: [file("cart.spec.ts")] })).toEqual({ ok: true, paths: ["tests/__hidden__/cart.spec.ts"] });
    expect(existsSync(path.join(d, "tests/__hidden__/cart.spec.ts"))).toBe(true);
  });
  const bad: [string, string][] = [["", "../src/cart.ts"], ["", "src/cart.spec.ts"], ["", "/etc/__hidden__/x.spec.ts"], ["tests/__hidden__", "../../src/cart.ts"], ["", "a\\__hidden__\\x.spec.ts"]];
  for (const [dir, p] of bad) {
    it(`refuses ${JSON.stringify(p)} (dir ${JSON.stringify(dir)}) before writing anything`, () => {
      const d = tree();
      expect(writeHiddenTests(d, { dir, files: [file("tests/__hidden__/ok.spec.ts"), file(p)] })).toEqual({ ok: false });
      expect(existsSync(path.join(d, "tests"))).toBe(false);
    });
  }
});
