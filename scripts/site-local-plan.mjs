// D-639: the pure part of scripts/site-local-release.mjs — which installers a local build of the download site makes.
// All of them are built on this Apple Silicon Mac (electron-builder 26.17.0 cross-builds Windows and Linux without wine,
// with the toolsets below);
// the harness bundle has no native code, and node-pty carries its prebuilds for every OS (D-375), so one bundle serves all.

/** Every target, in the order the download page lists them. */
export const LOCAL_TARGETS = Object.freeze(["mac-arm64", "mac-x64", "win-x64", "linux-x64"]);

/** @param {string[]} argv @returns {{ targets: string[], skipBuild: boolean, serve: boolean }} */
export function parseLocalArgs(argv) {
  /** @type {Set<string>} */
  let chosen = new Set(["mac-arm64"]);
  let skipBuild = false;
  let serve = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") chosen = new Set(LOCAL_TARGETS);
    else if (a === "--skip-build") skipBuild = true;
    else if (a === "--no-serve") serve = false;
    else if (a === "--targets") {
      const list = (argv[++i] ?? "").split(",").filter((t) => t !== "");
      if (list.length === 0 || list[0].startsWith("--")) throw new Error("site-local: --targets needs a value");
      for (const t of list) if (!LOCAL_TARGETS.includes(t)) throw new Error(`site-local: unknown target ${t} (${LOCAL_TARGETS.join(", ")})`);
      chosen = new Set(list);
    } else throw new Error(`site-local: unknown argument ${a}`);
  }
  return { targets: LOCAL_TARGETS.filter((t) => chosen.has(t)), skipBuild, serve };
}

const CONFIG = ["--config", "electron-builder.config.mjs"];
const NEVER = ["--publish", "never"];
// The default NSIS (nsis-3.0.4.1, mac/makensis) and AppImage (appimage-12.0.1, darwin/mksquashfs) tools of electron-builder
// 26.17.0 are x86_64 only and fail on an Apple Silicon Mac without Rosetta ("Bad CPU type", spawn -86). Its newer bundles
// run here (tried 26.11.2026): toolsets.nsis 1.2.1 (makensis 3.12) and toolsets.appimage 1.0.3. Only for these local runs;
// the CI file keeps the defaults on its own OS.
const NSIS_ARM64 = "-c.toolsets.nsis=1.2.1";
const APPIMAGE_ARM64 = "-c.toolsets.appimage=1.0.3";
// fpm compresses the .deb with xz by default, and there is no xz binary on macOS or in linux-tools-mac 1.0.1 (gtar -J
// fails): gzip, which dpkg reads too
const DEB_GZIP = "-c.deb.compression=gz";

/**
 * One electron-builder run per target (a failing target does not hide which one failed). The Mac arch comes only from
 * MANDAT_MAC_ARCH (electron-builder.config.mjs), so the signing there (D-637) stays as it is.
 * @param {readonly string[]} targets @returns {{ target: string, args: string[], env: Record<string, string> }[]}
 */
export function builderRuns(targets) {
  return targets.map((target) => {
    if (target === "mac-arm64" || target === "mac-x64") return { target, args: [...CONFIG, "--mac", ...NEVER], env: { MANDAT_MAC_ARCH: target.slice(4) } };
    if (target === "win-x64") return { target, args: [...CONFIG, NSIS_ARM64, "--win", "--x64", ...NEVER], env: {} };
    if (target === "linux-x64") return { target, args: [...CONFIG, APPIMAGE_ARM64, DEB_GZIP, "--linux", "--x64", ...NEVER], env: {} };
    throw new Error(`site-local: unknown target ${target}`);
  });
}

/** The SiteAssetKind values (packages/contract site.ts) the targets produce. @param {readonly string[]} targets */
export function siteKinds(targets) {
  return targets.flatMap((t) => (t === "linux-x64" ? ["linux-appimage", "linux-deb"] : [t]));
}
