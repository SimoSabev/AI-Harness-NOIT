import { describe, expect, it } from "vitest";
import { BUNDLE_INSTALL_ARGS, bundleSourceFiles, buildOutputs, foreignNativeAddons, keepNextFile, workspaceShim } from "./bundle-plan.js";

// E9g A5 (D-376): what goes into resources/harness of the installed app.
describe("the harness bundle (E9g A5, D-376)", () => {
  it("source files: everything tracked that the CLI, the image builds and the fixtures need; not docs, CI or the desktop itself", () => {
    const tracked = [
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      ".dockerignore",
      "docker/sandbox/Dockerfile",
      "supabase/migrations/0001_init.sql",
      "fixtures/shop/package.json",
      "packages/cli/src/main.ts",
      "apps/web/src/app/page.tsx",
      "apps/web/public/icon-192.png",
      "docs/decisions.md",
      "apps/desktop/src/main.ts",
      ".github/workflows/ci.yml",
      ".claude/workflows/e9g-night.js",
    ];
    expect(bundleSourceFiles(tracked)).toEqual([
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      ".dockerignore",
      "docker/sandbox/Dockerfile",
      "supabase/migrations/0001_init.sql",
      "fixtures/shop/package.json",
      "packages/cli/src/main.ts",
      "apps/web/src/app/page.tsx",
      "apps/web/public/icon-192.png",
    ]);
  });
  it("build outputs: dist of every workspace package, the Next build of apps/web without its cache", () => {
    expect(buildOutputs(["packages/cli", "packages/contract", "apps/web", "apps/worker", "bench"])).toEqual([
      "packages/cli/dist",
      "packages/contract/dist",
      "apps/web/.next",
      "apps/worker/dist",
      "bench/dist",
    ]);
    expect(keepNextFile("cache/webpack/x.pack")).toBe(false);
    expect(keepNextFile("trace")).toBe(false);
    expect(keepNextFile("server/app/page.js")).toBe(true);
    expect(keepNextFile("BUILD_ID")).toBe(true);
  });
  it("node_modules: production only, hoisted (workspace packages stay links, so repoRoot is right), no install scripts", () => {
    expect(BUNDLE_INSTALL_ARGS).toEqual(expect.arrayContaining(["install", "--prod", "--frozen-lockfile", "--ignore-scripts", "--config.node-linker=hoisted"]));
    expect(BUNDLE_INSTALL_ARGS.join(" ")).toContain("--filter @mandat/cli...");
    expect(BUNDLE_INSTALL_ARGS.join(" ")).toContain("--filter @mandat/web...");
  });
  it("native addons other than Next's own compiler would tie the bundle to one OS/arch: they are reported", () => {
    expect(
      foreignNativeAddons([
        "node_modules/@next/swc-darwin-arm64/next-swc.darwin-arm64.node",
        "node_modules/pg/lib/index.js",
        "node_modules/some-native/build/Release/addon.node",
      ]),
    ).toEqual(["node_modules/some-native/build/Release/addon.node"]);
  });
  it("workspace links become shim packages that re-export the real files (installers cannot carry links; repoRoot stays right)", () => {
    const shim = workspaceShim("@mandat/worker", { ".": { types: "./dist/index.d.ts", default: "./dist/index.js" }, "./push": { default: "./dist/online/push.js" } }, "../../../apps/worker");
    expect(JSON.parse(shim?.["package.json"] ?? "{}")).toEqual({ name: "@mandat/worker", private: true, type: "module", exports: { ".": "./index.js", "./push": "./push.js" } });
    expect(shim?.["index.js"]).toBe('export * from "../../../apps/worker/dist/index.js";\n');
    expect(shim?.["push.js"]).toBe('export * from "../../../apps/worker/dist/online/push.js";\n');
    expect(workspaceShim("@mandat/web", undefined, "../../../apps/web")).toBeNull();
  });
});
