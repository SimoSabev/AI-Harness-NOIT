import { cleanClone, must, removeTree } from "./git-tree.js";

/** 7.7(5): new clean clone of base + `git apply --index --binary` → write-tree. */
export async function recomputeTreeSha(o: { mirrorPath: string; baseSha: string; diffPatch: Buffer; tmpRoot: string }): Promise<{ treeSha: string } | { error: "apply_failed" }> {
  const { dir, git } = await cleanClone({ ...o, name: "recompute" });
  try {
    if (o.diffPatch.length > 0) {
      const r = await git.run(["apply", "--index", "--binary", "--whitespace=nowarn", "-"], { cwd: dir, input: o.diffPatch });
      if (r.code !== 0) return { error: "apply_failed" };
    }
    return { treeSha: (await must(git, ["write-tree"], dir)).toString("utf8").trim() };
  } finally {
    removeTree(dir);
  }
}
