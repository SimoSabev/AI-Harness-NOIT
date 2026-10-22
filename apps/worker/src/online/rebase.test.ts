import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFixture } from "../fixtures.js";
import { repoRoot } from "../testing.js";
import { mainHead, rebaseOnto } from "./rebase.js";

// E8f (v5 p. 4.6 (3), AC-4.5, D-355): the base moved while the task ran. The harness applies the change 3-way onto the new
// main in a temporary clone: clean → the rebased patch (a new attempt verifies it); conflict → the conflicting files.
const PATCH = readFileSync(path.join(repoRoot, "demo/recordings/scene1-task1.patch"));
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x" };
/** a commit on the mirror's main (another person merged something) */
function moveMain(mirror: string, file: string, edit: (s: string) => string): string {
  const w = path.join(mkdtempSync(path.join(os.tmpdir(), "mandat-move-")), "w");
  execFileSync("git", ["clone", "-q", mirror, w], { env });
  writeFileSync(path.join(w, file), edit(readFileSync(path.join(w, file), "utf8")));
  execFileSync("git", ["commit", "-qam", "someone else"], { cwd: w, env });
  execFileSync("git", ["push", "-q", "origin", "HEAD:main", "HEAD:master"], { cwd: w, env });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: w, env, encoding: "utf8" }).trim();
}
const fixture = () => buildFixture({ repoRoot, mandatHome: mkdtempSync(path.join(os.tmpdir(), "mandat-rb-")), force: false, name: "demo-shop" });

describe("rebaseOnto (AC-4.5)", () => {
  it("main moved in another file → clean: the rebased patch applies on the new head and changes only src/cart.ts", async () => {
    const fx = fixture();
    const head = moveMain(fx.mirror, "README.md", (s) => s + "\nmore\n");
    expect(await mainHead(fx.mirror)).toBe(head);
    const r = await rebaseOnto({ mirror: fx.mirror, base: head, patch: PATCH });
    expect(r.kind).toBe("clean");
    if (r.kind === "clean") {
      expect(r.files).toEqual(["src/cart.ts"]);
      expect(r.patch.toString("utf8")).toContain("+const DISCOUNT_THRESHOLD_CENTS = 5000;");
    }
  });
  it("main changed the same line → conflict with the file named and the conflict as an artifact", async () => {
    const fx = fixture();
    const head = moveMain(fx.mirror, "src/cart.ts", (s) => s.replace("const DISCOUNT_THRESHOLD_CENTS = 50000;", "const DISCOUNT_THRESHOLD_CENTS = 40000;"));
    const r = await rebaseOnto({ mirror: fx.mirror, base: head, patch: PATCH });
    expect(r.kind).toBe("conflict");
    if (r.kind === "conflict") {
      expect(r.files).toEqual(["src/cart.ts"]);
      expect(r.diff).toContain("<<<<<<<");
    }
  });
});
