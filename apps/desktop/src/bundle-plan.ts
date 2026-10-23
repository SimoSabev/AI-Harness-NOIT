// E9g A5 (D-376): the pure part of scripts/bundle-harness.mjs — what goes into resources/harness of the installed app.
// The bundle has the layout of the repo, so the CLI's repoRoot (three levels up from packages/cli/dist/main.js), the
// image builds (Dockerfiles + sources + lockfile, D-078), the migrations and the demo fixture work unchanged.

/** Tracked paths not needed at run time: the docs, CI, agent tooling and the desktop app itself (it is the shell). */
const EXCLUDED_PREFIXES = ["docs/", "apps/desktop/", ".github/", ".claude/"];

export function bundleSourceFiles(tracked: readonly string[]): string[] {
  return tracked.filter((f) => !EXCLUDED_PREFIXES.some((p) => f.startsWith(p)));
}

/** The build outputs to copy (they are gitignored): dist/ of each workspace package, .next of apps/web. */
export function buildOutputs(members: readonly string[]): string[] {
  return members.map((m) => (m === "apps/web" ? "apps/web/.next" : `${m}/dist`));
}

/** Inside apps/web/.next: the build cache and the trace are for building, not for `next start`. */
export function keepNextFile(rel: string): boolean {
  const first = rel.split("/")[0];
  return first !== "cache" && first !== "trace" && first !== "diagnostics";
}

/**
 * Production dependencies of the CLI and the web only; hoisted, so the workspace packages are links to their folders
 * in the bundle and import.meta.url-based paths (repoRoot) stay right; no install scripts (nothing to compile).
 */
export const BUNDLE_INSTALL_ARGS: readonly string[] = Object.freeze([
  "install",
  "--prod",
  "--frozen-lockfile",
  "--prefer-offline",
  "--ignore-scripts",
  "--config.node-linker=hoisted",
  "--filter",
  "@mandat/cli...",
  "--filter",
  "@mandat/web...",
]);

/** .node files other than Next's compiler (not used by `next start`) would make the bundle OS/arch specific. */
export function foreignNativeAddons(files: readonly string[]): string[] {
  return files.filter((f) => f.endsWith(".node") && !/(^|\/)@next\/swc-[^/]+\//.test(f));
}

type ExportTarget = string | { default?: string; import?: string; types?: string };

/**
 * A workspace package in the bundle's node_modules as a small shim package instead of a link: dmg/nsis/AppImage do not
 * reliably carry links (electron-builder makes junctions with absolute build paths on Windows), and a copy would move
 * the code away from its folder (repoRoot, computed from import.meta.url, would be wrong). Each export re-exports the
 * real file in its real folder. `rel` is the path from the shim folder to the package folder. null: nothing to export.
 */
export function workspaceShim(name: string, exportsMap: Record<string, ExportTarget> | undefined, rel: string): Record<string, string> | null {
  if (!exportsMap) return null;
  const files: Record<string, string> = {};
  const exportsOut: Record<string, string> = {};
  for (const [sub, target] of Object.entries(exportsMap)) {
    const file = typeof target === "string" ? target : (target.import ?? target.default);
    if (!file || !/^\.\/[\w./-]+\.js$/.test(file) || !/^\.(\/[a-z-]+)?$/.test(sub)) continue;
    const shimFile = sub === "." ? "index.js" : `${sub.slice(2)}.js`;
    exportsOut[sub] = `./${shimFile}`;
    files[shimFile] = `export * from "${rel}/${file.slice(2)}";\n`;
  }
  if (Object.keys(exportsOut).length === 0) return null;
  files["package.json"] = JSON.stringify({ name, private: true, type: "module", exports: exportsOut }, null, 2) + "\n";
  return files;
}
