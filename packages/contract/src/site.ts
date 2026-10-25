import { z } from "zod";
import { MandatError } from "./errors.js";

// E9g B (D-377): the download site (apps/site) is static. Its list of installers is apps/site/releases.json, written by
// scripts/release-manifest.mjs from the electron-builder output (artifactName `Harness-${version}-${os}-${arch}.${ext}`,
// apps/desktop/electron-builder.config.mjs). No release yet → version null, no assets → the site says "coming soon".

/** Where the installers are published (Q-054): the GitHub releases of this repo, one tag per version (D-379). */
export const SITE_RELEASE_REPO = "SimoSabev/AI-Harness-NOIT";

export const SiteAssetKind = z.enum(["mac-arm64", "mac-x64", "win-x64", "linux-appimage", "linux-deb"]);
export type SiteAssetKind = z.infer<typeof SiteAssetKind>;

const SEMVER = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?`;
const FILE = new RegExp(String.raw`^Harness-(${SEMVER})-(mac|win|linux)-(arm64|x64|x86_64|amd64)\.(dmg|exe|AppImage|deb)$`);

/** The kind of an installer file name, or null for anything else (blockmaps, latest*.yml, zips, other arches). */
export function siteAssetKind(file: string): SiteAssetKind | null {
  const m = FILE.exec(file);
  if (!m) return null;
  const [, , os, arch, ext] = m;
  const x64 = arch !== "arm64";
  if (os === "mac" && ext === "dmg") return x64 ? "mac-x64" : "mac-arm64";
  if (os === "win" && ext === "exe" && x64) return "win-x64";
  if (os === "linux" && ext === "AppImage" && x64) return "linux-appimage";
  if (os === "linux" && ext === "deb" && x64) return "linux-deb";
  return null;
}

/** The version inside an installer file name (the manifest checks every file belongs to its version). */
function fileVersion(file: string): string | undefined {
  return FILE.exec(file)?.[1];
}

export const SiteAsset = z
  .object({
    kind: SiteAssetKind,
    file: z.string().max(200).regex(FILE, "not an installer file name"),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    size: z.number().int().positive(),
  })
  .strict()
  .refine((a) => siteAssetKind(a.file) === a.kind, "kind does not match the file name");
export type SiteAsset = z.infer<typeof SiteAsset>;

/**
 * Who serves the installers: "github" (the default, the published release) or "site" — the site itself under
 * /downloads/ (a local build: scripts/site-local-release.mjs copies the files in; nothing is published, rule 3).
 */
export const SiteAssetHost = z.enum(["github", "site"]);
export type SiteAssetHost = z.infer<typeof SiteAssetHost>;

export const SiteReleaseManifest = z
  .object({
    version: z.string().regex(new RegExp(`^${SEMVER}$`)).nullable(),
    host: SiteAssetHost.optional(),
    assets: z.array(SiteAsset).max(SiteAssetKind.options.length),
  })
  .strict()
  .refine((m) => (m.version === null) === (m.assets.length === 0), "a version needs assets and assets need a version")
  .refine((m) => new Set(m.assets.map((a) => a.kind)).size === m.assets.length, "duplicate kind")
  .refine((m) => m.assets.every((a) => fileVersion(a.file) === m.version), "a file of another version");
export type SiteReleaseManifest = z.infer<typeof SiteReleaseManifest>;

/** The tag of a release: electron-builder's GitHub publisher names it `v<version>` (tagNamePrefix, default "v"; D-379). */
export function siteReleaseTag(version: string): string {
  return `v${version}`;
}

/**
 * The download link of an installer: the asset of the release of its own version (never a guessed host). E9g review
 * (D-379): not `releases/latest/download/…` — the file names carry the version, so after a newer release a "latest"
 * link to the old file would be 404 and the SHA-256 on the page would describe another file.
 */
export function siteDownloadUrl(file: string, host: SiteAssetHost = "github"): string {
  const version = fileVersion(file);
  if (siteAssetKind(file) === null || version === undefined) throw new MandatError("E_USAGE", "not an installer file name", { file });
  if (host === "site") return `/downloads/${encodeURIComponent(file)}`;
  return `https://github.com/${SITE_RELEASE_REPO}/releases/download/${encodeURIComponent(siteReleaseTag(version))}/${encodeURIComponent(file)}`;
}

// E9g B step 7 (D-378): apps/site/shots.json — the harness screens scripts/site-shots.mjs photographs for the docs
// (one PNG per screen, language and theme in apps/site/public/shots). Routes are local paths of the harness web UI.
export const SiteShotList = z
  .object({
    viewport: z.object({ width: z.number().int().min(320).max(3840), height: z.number().int().min(320).max(2160) }).strict(),
    shots: z
      .array(z.object({ name: z.string().max(40).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/), route: z.string().max(200).regex(/^\/(?!\/)[\w\-./?=&%]*$/) }).strict())
      .min(1)
      .max(20)
      .refine((s) => new Set(s.map((x) => x.name)).size === s.length, "duplicate screen name"),
  })
  .strict();
export type SiteShotList = z.infer<typeof SiteShotList>;
