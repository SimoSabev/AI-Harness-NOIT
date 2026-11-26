import { SiteReleaseManifest } from "@mandat/contract";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import raw from "../../releases.json";
import { downloadRows, releaseManifest } from "./downloads";
import { INSTALL_STEPS } from "./install";
import { en } from "../i18n/en";
import { platformAnchor } from "./os";

const sha = "b".repeat(64);
// sha256 of the three bytes "abc"
const SHA_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

// E9g B (D-377): /download lists every installer; without a release each row says "coming soon", never a broken link.
describe("download rows (E9g B)", () => {
  it("the committed releases.json is valid", () => {
    expect(SiteReleaseManifest.safeParse(raw).success).toBe(true);
    // in a folder with only the committed file (a local `pnpm site:mac` build adds releases.local.json next to it)
    const dir = mkdtempSync(path.join(os.tmpdir(), "site-"));
    writeFileSync(path.join(dir, "releases.json"), JSON.stringify(raw));
    expect(releaseManifest(dir)).toEqual(SiteReleaseManifest.parse(raw));
  });
  it("no release → five rows, all coming soon, no link", () => {
    const rows = downloadRows({ version: null, assets: [] });
    expect(rows.map((r) => r.kind)).toEqual(["mac-arm64", "mac-x64", "win-x64", "linux-appimage", "linux-deb"]);
    expect(rows.map((r) => r.platform)).toEqual(["mac", "mac", "windows", "linux", "linux"]);
    for (const r of rows) expect(r.asset).toBeNull();
  });
  it("a partial release links what exists and keeps the rest coming soon", () => {
    const rows = downloadRows({ version: "0.1.0", assets: [{ kind: "mac-arm64", file: "Harnova-0.1.0-mac-arm64.dmg", sha256: sha, size: 230_686_720 }] });
    expect(rows[0]?.asset).toEqual({
      file: "Harnova-0.1.0-mac-arm64.dmg",
      sha256: sha,
      sizeMb: 220,
      url: "https://github.com/SimoSabev/AI-Harness-NOIT/releases/download/v0.1.0/Harnova-0.1.0-mac-arm64.dmg",
    });
    expect(rows.slice(1).every((r) => r.asset === null)).toBe(true);
  });
  it("each platform has its own anchor on /download", () => {
    expect([platformAnchor("mac"), platformAnchor("windows"), platformAnchor("linux"), platformAnchor("phone")]).toEqual(["mac", "windows", "linux", "phone"]);
  });

  it("a local build (releases.local.json, host site) wins over releases.json and links /downloads/<file>", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "site-"));
    writeFileSync(path.join(dir, "releases.json"), JSON.stringify({ version: null, assets: [] }));
    const file = "Harnova-0.1.0-mac-arm64.dmg";
    writeFileSync(path.join(dir, "releases.local.json"), JSON.stringify({ version: "0.1.0", host: "site", assets: [{ kind: "mac-arm64", file, sha256: SHA_ABC, size: 3 }] }));
    mkdirSync(path.join(dir, "public", "downloads"), { recursive: true });
    writeFileSync(path.join(dir, "public", "downloads", file), "abc");
    const m = releaseManifest(dir);
    expect(m.host).toBe("site");
    expect(downloadRows(m)[0]?.asset?.url).toBe(`/downloads/${file}`);
  });
  it("host site with a missing or different file fails the build instead of shipping a broken link", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "site-"));
    const file = "Harnova-0.1.0-mac-arm64.dmg";
    writeFileSync(path.join(dir, "releases.local.json"), JSON.stringify({ version: "0.1.0", host: "site", assets: [{ kind: "mac-arm64", file, sha256: sha, size: 3 }] }));
    expect(() => releaseManifest(dir)).toThrow(/downloads/);
    mkdirSync(path.join(dir, "public", "downloads"), { recursive: true });
    writeFileSync(path.join(dir, "public", "downloads", file), "abcd");
    expect(() => releaseManifest(dir)).toThrow(/size/);
  });
  it("D-639: host site with a file of the right size but other bytes fails: the SHA-256 on the page is the file's", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "site-"));
    const file = "Harnova-0.1.0-win-x64.exe";
    writeFileSync(path.join(dir, "releases.local.json"), JSON.stringify({ version: "0.1.0", host: "site", assets: [{ kind: "win-x64", file, sha256: SHA_ABC, size: 3 }] }));
    mkdirSync(path.join(dir, "public", "downloads"), { recursive: true });
    writeFileSync(path.join(dir, "public", "downloads", file), "abd");
    expect(() => releaseManifest(dir)).toThrow(/SHA-256/);
    writeFileSync(path.join(dir, "public", "downloads", file), "abc");
    expect(releaseManifest(dir).assets[0]?.sha256).toBe(SHA_ABC);
  });
  it("D-639: every system has install steps, each one a key of the catalog", () => {
    expect(Object.keys(INSTALL_STEPS)).toEqual(["mac", "windows", "linux"]);
    for (const [p, keys] of Object.entries(INSTALL_STEPS)) {
      expect(keys.length, p).toBeGreaterThanOrEqual(3);
      for (const k of keys) expect(Object.keys(en), k).toContain(k);
      expect(Object.keys(en)).toContain(`install.${p}.title`);
    }
  });
});
