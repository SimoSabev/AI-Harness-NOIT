import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { MandatError, SiteReleaseManifest, siteDownloadUrl } from "@mandat/contract";
import type { SiteAssetKind } from "@mandat/contract";
import type { Platform } from "./os";

// E9g B (D-377): the rows of /download, from apps/site/releases.json (scripts/release-manifest.mjs). The manifest is
// parsed at build time, so a broken one fails the build instead of shipping a wrong link or hash.
// A local build (scripts/site-local-release.mjs) writes apps/site/releases.local.json (ignored by git, host "site")
// and copies the installers into public/downloads; that manifest wins, and every file it names must be there.

const ROWS: readonly { kind: SiteAssetKind; platform: Platform }[] = [
  { kind: "mac-arm64", platform: "mac" },
  { kind: "mac-x64", platform: "mac" },
  { kind: "win-x64", platform: "windows" },
  { kind: "linux-appimage", platform: "linux" },
  { kind: "linux-deb", platform: "linux" },
];

export interface DownloadRow {
  kind: SiteAssetKind;
  platform: Platform;
  /** null = no published file yet → "coming soon", no link. */
  asset: { file: string; sha256: string; sizeMb: number; url: string } | null;
}

/** @param siteDir apps/site (next build runs there, hence the default) */
export function releaseManifest(siteDir: string = process.cwd()): SiteReleaseManifest {
  const local = path.join(siteDir, "releases.local.json");
  const m = SiteReleaseManifest.parse(JSON.parse(readFileSync(existsSync(local) ? local : path.join(siteDir, "releases.json"), "utf8")));
  if (m.host === "site") {
    for (const a of m.assets) {
      const f = path.join(siteDir, "public", "downloads", a.file);
      if (!existsSync(f)) throw new MandatError("E_USAGE", "releases.local.json names a file missing from public/downloads", { file: a.file });
      if (statSync(f).size !== a.size) throw new MandatError("E_USAGE", "public/downloads file size differs from releases.local.json", { file: a.file });
    }
  }
  return m;
}

export function downloadRows(m: SiteReleaseManifest): DownloadRow[] {
  return ROWS.map(({ kind, platform }) => {
    const a = m.assets.find((x) => x.kind === kind);
    return { kind, platform, asset: a ? { file: a.file, sha256: a.sha256, sizeMb: Math.round(a.size / 1_048_576), url: siteDownloadUrl(a.file, m.host) } : null };
  });
}
