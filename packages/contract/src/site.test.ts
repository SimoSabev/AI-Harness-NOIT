import { describe, expect, it } from "vitest";
import { SITE_RELEASE_REPO, SiteReleaseManifest, siteAssetKind, siteDownloadUrl } from "./site.js";

const sha = "a".repeat(64);
const asset = (kind: string, file: string) => ({ kind, file, sha256: sha, size: 1024 });

// E9g B (D-377): the download site reads apps/site/releases.json; scripts/release-manifest.mjs writes it.
describe("site release manifest (E9g B)", () => {
  it("an empty manifest (no release yet) is valid", () => {
    expect(SiteReleaseManifest.parse({ version: null, assets: [] })).toEqual({ version: null, assets: [] });
  });
  it("a full manifest with the five installers is valid", () => {
    const m = {
      version: "0.1.0",
      assets: [
        asset("mac-arm64", "Harness-0.1.0-mac-arm64.dmg"),
        asset("mac-x64", "Harness-0.1.0-mac-x64.dmg"),
        asset("win-x64", "Harness-0.1.0-win-x64.exe"),
        asset("linux-appimage", "Harness-0.1.0-linux-x86_64.AppImage"),
        asset("linux-deb", "Harness-0.1.0-linux-amd64.deb"),
      ],
    };
    expect(SiteReleaseManifest.parse(m)).toEqual(m);
  });
  it("refuses a version without assets, assets without a version, a duplicate kind, a file of another version", () => {
    expect(SiteReleaseManifest.safeParse({ version: "0.1.0", assets: [] }).success).toBe(false);
    expect(SiteReleaseManifest.safeParse({ version: null, assets: [asset("mac-arm64", "Harness-0.1.0-mac-arm64.dmg")] }).success).toBe(false);
    const dup = [asset("mac-arm64", "Harness-0.1.0-mac-arm64.dmg"), asset("mac-arm64", "Harness-0.1.0-mac-arm64.dmg")];
    expect(SiteReleaseManifest.safeParse({ version: "0.1.0", assets: dup }).success).toBe(false);
    expect(SiteReleaseManifest.safeParse({ version: "0.2.0", assets: [asset("mac-arm64", "Harness-0.1.0-mac-arm64.dmg")] }).success).toBe(false);
  });
  it("refuses a kind that does not match the file, a bad hash, a path, unknown fields", () => {
    expect(SiteReleaseManifest.safeParse({ version: "0.1.0", assets: [asset("mac-x64", "Harness-0.1.0-mac-arm64.dmg")] }).success).toBe(false);
    expect(SiteReleaseManifest.safeParse({ version: "0.1.0", assets: [{ ...asset("mac-arm64", "Harness-0.1.0-mac-arm64.dmg"), sha256: "XYZ" }] }).success).toBe(false);
    expect(SiteReleaseManifest.safeParse({ version: "0.1.0", assets: [asset("mac-arm64", "../Harness-0.1.0-mac-arm64.dmg")] }).success).toBe(false);
    expect(SiteReleaseManifest.safeParse({ version: null, assets: [], extra: 1 }).success).toBe(false);
    expect(SiteReleaseManifest.safeParse({ version: "latest", assets: [] }).success).toBe(false);
  });
  it("maps electron-builder file names to a kind; everything else is null", () => {
    expect(siteAssetKind("Harness-1.2.3-mac-arm64.dmg")).toBe("mac-arm64");
    expect(siteAssetKind("Harness-1.2.3-mac-x64.dmg")).toBe("mac-x64");
    expect(siteAssetKind("Harness-1.2.3-win-x64.exe")).toBe("win-x64");
    expect(siteAssetKind("Harness-1.2.3-linux-x64.AppImage")).toBe("linux-appimage");
    expect(siteAssetKind("Harness-1.2.3-linux-x86_64.AppImage")).toBe("linux-appimage");
    expect(siteAssetKind("Harness-1.2.3-linux-amd64.deb")).toBe("linux-deb");
    expect(siteAssetKind("Harness-1.2.3-beta.1-linux-x64.deb")).toBe("linux-deb");
    for (const f of ["Harness-1.2.3-win-x64.exe.blockmap", "latest-mac.yml", "Harness-1.2.3-mac-arm64.zip", "Other-1.2.3-mac-arm64.dmg", "Harness-1.2.3-win-arm64.exe"]) {
      expect(siteAssetKind(f), f).toBeNull();
    }
  });
  it("download links go to the latest GitHub release of the repo", () => {
    expect(SITE_RELEASE_REPO).toBe("SimoSabev/AI-Harness-NOIT");
    expect(siteDownloadUrl("Harness-0.1.0-mac-arm64.dmg")).toBe("https://github.com/SimoSabev/AI-Harness-NOIT/releases/latest/download/Harness-0.1.0-mac-arm64.dmg");
    expect(() => siteDownloadUrl("../x")).toThrow();
  });
});
