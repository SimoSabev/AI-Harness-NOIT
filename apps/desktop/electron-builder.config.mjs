// E9g A5 (D-376): electron-builder for the 3 OS, unsigned (AC-12.1 without signing; docs/setup/signing.md has the steps).
// The harness bundle (scripts/bundle-harness.mjs) goes into resources/harness. Everything is built outside the repo
// ($MANDAT_DESKTOP_OUT, default <tmp>/mandat-desktop), so neither the Docker build context of the repo nor the tests see it.
// Built only with `--publish never`: no release, no upload (rule 3). The publish entry only writes app-update.yml for
// electron-updater, which stays off unless MANDAT_UPDATE_FEED is set (src/updater.ts, Q-054).
import os from "node:os";
import path from "node:path";

const out = process.env.MANDAT_DESKTOP_OUT ? path.resolve(process.env.MANDAT_DESKTOP_OUT) : path.join(os.tmpdir(), "mandat-desktop");

/** @type {import("electron-builder").Configuration} */
export const config = {
  appId: "org.mandat.harness",
  productName: "Harness",
  // the installed app is "Harness" to Electron too: its own userData (~/Library/Application Support/Harness, the default
  // MANDAT_HOME is <userData>/mandat) and its own keychain entry; dev (`pnpm desktop`) keeps the package name
  extraMetadata: { productName: "Harness" },
  copyright: "GPL-3.0-or-later",
  artifactName: "Harness-${version}-${os}-${arch}.${ext}",
  directories: { output: path.join(out, "release"), buildResources: "build-resources" },
  files: ["dist/**/*", "package.json", "!dist/**/*.test.*", "!dist/bundle-plan.*"],
  // electron-builder always drops the top-level node_modules of a copied folder (app-builder-lib util/filter.js), so the
  // bundle's node_modules is a second entry of its own; the bundle has no links (scripts/bundle-harness.mjs checks it)
  extraResources: [
    { from: path.join(out, "harness"), to: "harness" },
    { from: path.join(out, "harness", "node_modules"), to: "harness/node_modules" },
  ],
  asar: true,
  // node-pty is native (prebuilds, N-API): it must be a real file on disk, and nothing is recompiled (D-375)
  asarUnpack: ["node_modules/node-pty/**"],
  npmRebuild: false,
  icon: "../web/public/icon-512.png",
  publish: [{ provider: "github", owner: "SimoSabev", repo: "AI-Harness-NOIT" }],
  mac: {
    target: [{ target: "dmg", arch: ["arm64", "x64"] }],
    category: "public.app-category.developer-tools",
    // unsigned until Simo has an Apple Developer ID (Q-053); null = do not even look for a signing identity
    identity: null,
  },
  win: { target: [{ target: "nsis", arch: ["x64"] }] },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true },
  linux: {
    executableName: "harness",
    target: [
      { target: "AppImage", arch: ["x64"] },
      { target: "deb", arch: ["x64"] },
    ],
    category: "Development",
    maintainer: "Mandat <noreply@mandat.invalid>",
    synopsis: "Harness: AI coding tasks in a Docker sandbox, judged by Mandat",
  },
};

export default config;
