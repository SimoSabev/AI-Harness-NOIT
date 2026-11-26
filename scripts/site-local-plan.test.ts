import { describe, expect, it } from "vitest";
import { LOCAL_TARGETS, builderRuns, parseLocalArgs, siteKinds } from "./site-local-plan.mjs";

// D-639: the local download site with the installers this Apple Silicon Mac can build (`pnpm site:all`).
describe("local site build plan (D-639)", () => {
  it("no arguments: only the Apple Silicon dmg, as `pnpm site:mac` always did, and the site is served", () => {
    expect(parseLocalArgs([])).toEqual({ targets: ["mac-arm64"], skipBuild: false, serve: true });
  });
  it("--all: every target in a fixed order; --targets picks some; --skip-build and --no-serve", () => {
    expect(parseLocalArgs(["--all"]).targets).toEqual(["mac-arm64", "mac-x64", "win-x64", "linux-x64"]);
    expect(LOCAL_TARGETS).toEqual(["mac-arm64", "mac-x64", "win-x64", "linux-x64"]);
    expect(parseLocalArgs(["--targets", "linux-x64,mac-x64", "--skip-build", "--no-serve"])).toEqual({
      targets: ["mac-x64", "linux-x64"],
      skipBuild: true,
      serve: false,
    });
  });
  it("rejects unknown flags, unknown targets and an empty list", () => {
    expect(() => parseLocalArgs(["--publish"])).toThrow(/unknown argument --publish/);
    expect(() => parseLocalArgs(["--targets", "win-arm64"])).toThrow(/unknown target win-arm64/);
    expect(() => parseLocalArgs(["--targets"])).toThrow(/--targets needs a value/);
    expect(() => parseLocalArgs(["--targets", ","])).toThrow(/--targets needs a value/);
  });
  // the default NSIS and AppImage tools of electron-builder 26.17.0 for macOS are x86_64 only (no Rosetta here):
  // the local runs use its arm64-capable bundles nsis 1.2.1 and appimage 1.0.3; CI keeps the defaults. The .deb is gzip
  // here: fpm's xz needs an xz binary that neither macOS nor linux-tools-mac 1.0.1 has
  it("one electron-builder run per target, never publishing; the Mac arch only through MANDAT_MAC_ARCH", () => {
    expect(builderRuns(["mac-arm64", "mac-x64", "win-x64", "linux-x64"])).toEqual([
      { target: "mac-arm64", args: ["--config", "electron-builder.config.mjs", "--mac", "--publish", "never"], env: { MANDAT_MAC_ARCH: "arm64" } },
      { target: "mac-x64", args: ["--config", "electron-builder.config.mjs", "--mac", "--publish", "never"], env: { MANDAT_MAC_ARCH: "x64" } },
      { target: "win-x64", args: ["--config", "electron-builder.config.mjs", "-c.toolsets.nsis=1.2.1", "--win", "--x64", "--publish", "never"], env: {} },
      { target: "linux-x64", args: ["--config", "electron-builder.config.mjs", "-c.toolsets.appimage=1.0.3", "-c.deb.compression=gz", "--linux", "--x64", "--publish", "never"], env: {} },
    ]);
    for (const r of builderRuns(LOCAL_TARGETS)) expect(r.args.slice(-2)).toEqual(["--publish", "never"]);
  });
  it("the site kinds of the targets: Linux gives the AppImage and the deb", () => {
    expect(siteKinds(["mac-arm64"])).toEqual(["mac-arm64"]);
    expect(siteKinds(LOCAL_TARGETS)).toEqual(["mac-arm64", "mac-x64", "win-x64", "linux-appimage", "linux-deb"]);
  });
});
