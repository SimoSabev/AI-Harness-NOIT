import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildManifest, defaultReleaseDir, parseArgs, writeReleaseManifest } from "./release-manifest.mjs";

const sha = (c: string) => c.repeat(64);

// E9g B (D-377): apps/site/releases.json from the electron-builder output folder.
describe("release manifest (E9g B)", () => {
  it("keeps only the installers, sorted by kind, with hash and size", () => {
    const m = buildManifest([
      { name: "Harness-0.1.0-linux-x64.deb", sha256: sha("e"), size: 5 },
      { name: "Harness-0.1.0-mac-arm64.dmg", sha256: sha("a"), size: 1 },
      { name: "Harness-0.1.0-mac-arm64.dmg.blockmap", sha256: sha("f"), size: 9 },
      { name: "latest-mac.yml", sha256: sha("f"), size: 9 },
      { name: "builder-debug.yml", sha256: sha("f"), size: 9 },
      { name: "Harness-0.1.0-win-x64.exe", sha256: sha("c"), size: 3 },
    ]);
    expect(m).toEqual({
      version: "0.1.0",
      assets: [
        { kind: "mac-arm64", file: "Harness-0.1.0-mac-arm64.dmg", sha256: sha("a"), size: 1 },
        { kind: "win-x64", file: "Harness-0.1.0-win-x64.exe", sha256: sha("c"), size: 3 },
        { kind: "linux-deb", file: "Harness-0.1.0-linux-x64.deb", sha256: sha("e"), size: 5 },
      ],
    });
  });
  it("no installers → the empty manifest (the site says coming soon)", () => {
    expect(buildManifest([{ name: "latest.yml", sha256: sha("a"), size: 1 }])).toEqual({ version: null, assets: [] });
  });
  it("several versions in one folder need --version", () => {
    const files = [
      { name: "Harness-0.1.0-mac-arm64.dmg", sha256: sha("a"), size: 1 },
      { name: "Harness-0.2.0-mac-arm64.dmg", sha256: sha("b"), size: 2 },
    ];
    expect(() => buildManifest(files)).toThrow(/several versions: 0\.1\.0, 0\.2\.0/);
    expect(buildManifest(files, "0.2.0").assets).toEqual([{ kind: "mac-arm64", file: "Harness-0.2.0-mac-arm64.dmg", sha256: sha("b"), size: 2 }]);
  });
  it("arguments and the default folder of electron-builder", () => {
    expect(parseArgs([])).toEqual({ dir: undefined, out: undefined, version: undefined });
    expect(parseArgs(["--dir", "/x", "--out", "/y.json", "--version", "1.0.0"])).toEqual({ dir: "/x", out: "/y.json", version: "1.0.0" });
    expect(() => parseArgs(["--publish"])).toThrow(/unknown argument/);
    expect(() => parseArgs(["--dir"])).toThrow(/needs a value/);
    expect(defaultReleaseDir({ MANDAT_DESKTOP_OUT: "/tmp/o" })).toBe(path.resolve("/tmp/o/release"));
    expect(defaultReleaseDir({})).toBe(path.join(os.tmpdir(), "mandat-desktop", "release"));
  });
  it("hashes the real files of a folder and writes the JSON", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "release-manifest-"));
    mkdirSync(path.join(dir, "mac-arm64"));
    writeFileSync(path.join(dir, "Harness-0.3.0-mac-arm64.dmg"), "dmg");
    writeFileSync(path.join(dir, "Harness-0.3.0-mac-arm64.dmg.blockmap"), "x");
    const out = path.join(dir, "releases.json");
    const m = await writeReleaseManifest({ dir, out });
    expect(m.assets).toEqual([
      // sha256 of the three bytes "dmg"
      { kind: "mac-arm64", file: "Harness-0.3.0-mac-arm64.dmg", sha256: "00cbbd0ddbda2762798f7009838ed34ca1f12b93965813c7df22943bc62166d1", size: 3 },
    ]);
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(m);
    expect(readFileSync(out, "utf8").endsWith("}\n")).toBe(true);
  });
});
