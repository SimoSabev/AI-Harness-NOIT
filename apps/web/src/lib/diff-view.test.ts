import { describe, expect, it } from "vitest";
import { isTestPath, splitDiff } from "./diff-view";

const D = [
  "diff --git a/src/cart.ts b/src/cart.ts",
  "index 1111111..2222222 100644",
  "--- a/src/cart.ts",
  "+++ b/src/cart.ts",
  "@@ -1,3 +1,3 @@",
  " const a = 1;",
  "-if (t > 50) {",
  "+if (t >= 50) {",
  "diff --git a/tests/cart.spec.ts b/tests/cart.spec.ts",
  "deleted file mode 100644",
  "--- a/tests/cart.spec.ts",
  "+++ /dev/null",
  "@@ -1,2 +0,0 @@",
  "-it('x', () => {});",
  "-it('y', () => {});",
].join("\n");

describe("splitDiff (D-299)", () => {
  it("по файл: път, вид, + и −, редовете без заглавките", () => {
    const f = splitDiff(D);
    expect(f.map((x) => [x.path, x.kind, x.added, x.removed])).toEqual([
      ["src/cart.ts", "modified", 1, 1],
      ["tests/cart.spec.ts", "deleted", 0, 2],
    ]);
    expect(f[0]?.lines.map((l) => l.kind)).toEqual(["hunk", "ctx", "del", "add"]);
  });
  it("нов файл и празен diff", () => {
    expect(splitDiff("diff --git a/n.ts b/n.ts\nnew file mode 100644\n--- /dev/null\n+++ b/n.ts\n@@ -0,0 +1 @@\n+x")[0]).toMatchObject({ path: "n.ts", kind: "added", added: 1 });
    expect(splitDiff("")).toEqual([]);
  });
  it("ред „-- …“ или „++ …“ в hunk е промяна, не заглавка", () => {
    const f = splitDiff(["diff --git a/db.sql b/db.sql", "index 1..2 100644", "--- a/db.sql", "+++ b/db.sql", "@@ -1,2 +1,2 @@", "--- стар коментар", "+++ нов коментар", " select 1;"].join("\n"));
    expect(f[0]).toMatchObject({ added: 1, removed: 1 });
    expect(f[0]?.lines.map((l) => [l.kind, l.text])).toEqual([["hunk", "@@ -1,2 +1,2 @@"], ["del", "--- стар коментар"], ["add", "+++ нов коментар"], ["ctx", " select 1;"]]);
  });
  it("бинарен файл: отбелязан, без base85 редове", () => {
    const bin = ["diff --git a/logo.png b/logo.png", "new file mode 100644", "index 0000000..3b18e51", "GIT binary patch", "literal 1234", "zcmV-=1Fu$x", "", "literal 0", "HcmV?d00001", "", "diff --git a/a.ts b/a.ts", "@@ -1 +1 @@", "-x", "+y"].join("\n");
    const f = splitDiff(bin);
    expect(f.map((x) => [x.path, x.kind, x.binary, x.lines.length])).toEqual([["logo.png", "added", true, 0], ["a.ts", "modified", false, 3]]);
    expect(splitDiff("diff --git a/i.png b/i.png\nindex 1..2 100644\nBinary files a/i.png and b/i.png differ")[0]).toMatchObject({ binary: true, lines: [] });
  });
  it("тестов файл по име", () => {
    expect(isTestPath("tests/cart.spec.ts")).toBe(true);
    expect(isTestPath("src/a.test.js")).toBe(true);
    expect(isTestPath("src/cart.ts")).toBe(false);
  });
});
