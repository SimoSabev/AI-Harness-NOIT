import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// D-443: a cache hit restores only the declared outputs. The root task declares dist/**, so a web build that hit the
// cache (the same inputs were built in another worktree) left an old .next behind and `pnpm local` served the old UI.
const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (rel: string) => JSON.parse(readFileSync(path.join(repoRoot, rel), "utf8")) as { tasks: { build: { outputs?: string[]; inputs?: string[] } } };

describe("turbo keeps the web build in its cache (D-443)", () => {
  it("apps/web caches .next, never its own cache folder", () => {
    const build = read("apps/web/turbo.json").tasks.build;
    expect(build.outputs).toContain(".next/**");
    expect(build.outputs).toContain("!.next/cache/**");
  });

  it("the web build follows its Next.js config and public files, not only src", () => {
    const inputs = read("apps/web/turbo.json").tasks.build.inputs ?? [];
    for (const f of ["src/**", "public/**", "next.config.ts", "postcss.config.mjs", "tsconfig.json", "package.json"]) expect(inputs).toContain(f);
  });
});
