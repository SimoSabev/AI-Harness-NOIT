import { SiteReleaseManifest, siteDownloadUrl } from "@mandat/contract";
import type { SiteAssetKind } from "@mandat/contract";
import raw from "../../releases.json";
import type { Platform } from "./os";

// E9g B (D-377): the rows of /download, from apps/site/releases.json (scripts/release-manifest.mjs). The manifest is
// parsed at build time, so a broken one fails the build instead of shipping a wrong link or hash.

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

export function releaseManifest(): SiteReleaseManifest {
  return SiteReleaseManifest.parse(raw);
}

export function downloadRows(m: SiteReleaseManifest): DownloadRow[] {
  return ROWS.map(({ kind, platform }) => {
    const a = m.assets.find((x) => x.kind === kind);
    return { kind, platform, asset: a ? { file: a.file, sha256: a.sha256, sizeMb: Math.round(a.size / 1_048_576), url: siteDownloadUrl(a.file) } : null };
  });
}
