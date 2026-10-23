import { describe, expect, it } from "vitest";
import { AUTO_APPLY_LIMITS, autoApply, diffStat } from "./auto-apply.js";

describe("diffStat", () => {
  it("файл, вид, добавени и махнати редове", () => {
    const patch = [
      "diff --git a/src/cart.ts b/src/cart.ts", "index 1..2 100644", "--- a/src/cart.ts", "+++ b/src/cart.ts", "@@ -1,2 +1,2 @@", "-a", "+b", " c",
      "diff --git a/docs/n.md b/docs/n.md", "new file mode 100644", "--- /dev/null", "+++ b/docs/n.md", "@@ -0,0 +1,2 @@", "+# Н", "+--- не е заглавие на diff",
      "diff --git a/old.ts b/old.ts", "deleted file mode 100644", "--- a/old.ts", "+++ /dev/null", "@@ -1 +0,0 @@", "-x",
      "diff --git a/a.ts b/b.ts", "similarity index 100%", "rename from a.ts", "rename to b.ts",
    ].join("\n");
    expect(diffStat(patch)).toEqual([
      { path: "src/cart.ts", kind: "modified", added: 1, removed: 1 },
      { path: "docs/n.md", kind: "added", added: 2, removed: 0 },
      { path: "old.ts", kind: "deleted", added: 0, removed: 1 },
      { path: "b.ts", kind: "renamed", added: 0, removed: 0 },
    ]);
    expect(diffStat("")).toEqual([]);
  });
});

const f = (path: string, kind: "added" | "modified" | "deleted" | "renamed" = "modified", added = 3, removed = 1) => ({ path, kind, added, removed });
const base = { result: "VERIFIED" as const, origin: "mandat" as const, files: [f("src/cart.ts"), f("docs/research.md", "added", 99, 0)] };

describe("autoApply: кога проверена промяна влиза сама (D-367)", () => {
  it("VERIFIED, обикновени файлове, малка → сама", () => {
    expect(autoApply(base)).toEqual({ auto: true, why: [] });
  });
  it("само VERIFIED; UNKNOWN и FAILED питат", () => {
    expect(autoApply({ ...base, result: "UNKNOWN" }).why).toEqual(["not_verified"]);
    expect(autoApply({ ...base, result: "FAILED" }).auto).toBe(false);
  });
  it("празна промяна и външен агент никога", () => {
    expect(autoApply({ ...base, files: [] }).why).toEqual(["empty"]);
    expect(autoApply({ ...base, origin: "external" }).why).toEqual(["external"]);
  });
  it("изтрит или преименуван файл пита", () => {
    expect(autoApply({ ...base, files: [f("src/old.ts", "deleted", 0, 40)] }).why).toEqual(["deleted:src/old.ts"]);
    expect(autoApply({ ...base, files: [f("src/b.ts", "renamed")] }).why).toEqual(["renamed:src/b.ts"]);
  });
  it.each([
    ["package.json", "deps"], ["pnpm-lock.yaml", "deps"], ["apps/web/package-lock.json", "deps"], ["requirements.txt", "deps"], ["go.sum", "deps"], ["Cargo.toml", "deps"],
    [".github/workflows/ci.yml", "ci"], [".gitlab-ci.yml", "ci"], ["Dockerfile", "ci"], ["deploy/prod.yaml", "ci"], ["infra/main.tf", "ci"],
    [".mandat.yml", "harness"], ["AGENTS.md", "harness"], ["sub/CLAUDE.md", "harness"], [".claude/settings.json", "harness"], [".mcp.json", "harness"], [".cursor/rules", "harness"],
    [".env", "secrets"], [".env.production", "secrets"], ["certs/server.pem", "secrets"], ["keys/id_rsa", "secrets"], [".npmrc", "secrets"],
    [".husky/pre-commit", "hooks"], ["supabase/migrations/001_init.sql", "migrations"], ["db/migrations/2.sql", "migrations"],
  ])("чувствителен път %s → %s", (path, cls) => {
    expect(autoApply({ ...base, files: [f(path)] }).why).toEqual([`sensitive:${cls}:${path}`]);
  });
  it("обикновени пътища не са чувствителни", () => {
    for (const p of ["src/env.ts", "docs/claude-notes.md", "README.md", "src/migrations-helper.ts", "tests/cart.spec.ts", "public/logo.svg"]) expect(autoApply({ ...base, files: [f(p)] }).auto).toBe(true);
  });
  it("твърде голяма: редове или брой файлове", () => {
    const big = autoApply({ ...base, files: [f("src/a.ts", "modified", AUTO_APPLY_LIMITS.lines, 1)] });
    expect(big.why).toEqual([`too_big:${AUTO_APPLY_LIMITS.lines + 1}`]);
    const many = Array.from({ length: AUTO_APPLY_LIMITS.files + 1 }, (_, i) => f(`src/f${i}.ts`, "modified", 1, 0));
    expect(autoApply({ ...base, files: many }).why).toEqual([`too_many_files:${AUTO_APPLY_LIMITS.files + 1}`]);
  });
  it("всички причини, без повторения; най-много 10 пътища", () => {
    const r = autoApply({ ...base, result: "UNKNOWN", files: [f("package.json"), f(".env"), f("src/x.ts", "deleted")] });
    expect(r.why).toEqual(["not_verified", "deleted:src/x.ts", "sensitive:deps:package.json", "sensitive:secrets:.env"]);
    const lots = Array.from({ length: 14 }, (_, i) => f(`.github/w${i}.yml`, "modified", 1, 0));
    expect(autoApply({ ...base, files: lots }).why.filter((w) => w.startsWith("sensitive:")).length).toBe(10);
  });
});
