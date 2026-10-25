import { SiteReleaseManifest } from "@mandat/contract";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import raw from "../../releases.json";
import { downloadRows, releaseManifest } from "./downloads";
import { platformAnchor } from "./os";

const sha = "b".repeat(64);

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
    const rows = downloadRows({ version: "0.1.0", assets: [{ kind: "mac-arm64", file: "Harness-0.1.0-mac-arm64.dmg", sha256: sha, size: 230_686_720 }] });
    expect(rows[0]?.asset).toEqual({
      file: "Harness-0.1.0-mac-arm64.dmg",
      sha256: sha,
      sizeMb: 220,
      url: "https://github.com/SimoSabev/AI-Harness-NOIT/releases/download/v0.1.0/Harness-0.1.0-mac-arm64.dmg",
    });
    expect(rows.slice(1).every((r) => r.asset === null)).toBe(true);
  });
  it("each platform has its own anchor on /download", () => {
    expect([platformAnchor("mac"), platformAnchor("windows"), platformAnchor("linux"), platformAnchor("phone")]).toEqual(["mac", "windows", "linux", "phone"]);
  });

  it("a local build (releases.local.json, host site) wins over releases.json and links /downloads/<file>", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "site-"));
    writeFileSync(path.join(dir, "releases.json"), JSON.stringify({ version: null, assets: [] }));
    const file = "Harness-0.1.0-mac-arm64.dmg";
    writeFileSync(path.join(dir, "releases.local.json"), JSON.stringify({ version: "0.1.0", host: "site", assets: [{ kind: "mac-arm64", file, sha256: sha, size: 3 }] }));
    mkdirSync(path.join(dir, "public", "downloads"), { recursive: true });
    writeFileSync(path.join(dir, "public", "downloads", file), "abc");
    const m = releaseManifest(dir);
    expect(m.host).toBe("site");
    expect(downloadRows(m)[0]?.asset?.url).toBe(`/downloads/${file}`);
  });
  it("host site with a missing or different file fails the build instead of shipping a broken link", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "site-"));
    const file = "Harness-0.1.0-mac-arm64.dmg";
    writeFileSync(path.join(dir, "releases.local.json"), JSON.stringify({ version: "0.1.0", host: "site", assets: [{ kind: "mac-arm64", file, sha256: sha, size: 3 }] }));
    expect(() => releaseManifest(dir)).toThrow(/downloads/);
    mkdirSync(path.join(dir, "public", "downloads"), { recursive: true });
    writeFileSync(path.join(dir, "public", "downloads", file), "abcd");
    expect(() => releaseManifest(dir)).toThrow(/size/);
  });
});
