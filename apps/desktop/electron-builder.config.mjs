// E9g A5 (D-376): electron-builder for the 3 OS, without a real signature (macOS ad-hoc, D-380; AC-12.1 without signing; docs/setup/signing.md has the steps).
// The harness bundle (scripts/bundle-harness.mjs) goes into resources/harness. Everything is built outside the repo
// ($MANDAT_DESKTOP_OUT, default <tmp>/mandat-desktop), so neither the Docker build context of the repo nor the tests see it.
// Built only with `--publish never`: no release, no upload (rule 3). The publish entry only writes app-update.yml for
// electron-updater, which stays off unless MANDAT_UPDATE_FEED is set (src/updater.ts, Q-054).
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const SHA1 = /^[0-9A-F]{40}$/;

/**
 * D-637: the Mac signing identity. Ad-hoc ("-") gives every build a new cdhash, and the keychain entry "Harness Safe Storage"
 * trusts each cdhash on its own, so every new build asked for the login password. A certificate with a Team ID keeps one
 * identity across builds: Developer ID first, then Apple Development (free Apple ID in Xcode). A self-signed certificate
 * has no Team ID, so the keychain would still see a new cdhash: ignored. The result is the SHA-1, which electron-builder
 * matches against `security find-identity -v` (app-builder-lib 26.17.0 codeSign/macCodeSign.js `_findIdentity`).
 * @param {string} findIdentityOutput output of `security find-identity -v -p codesigning`
 * @param {string | undefined} override MANDAT_MAC_IDENTITY: "-" (ad-hoc) or a SHA-1
 * @returns {string}
 */
export function pickMacIdentity(findIdentityOutput, override) {
  if (override !== undefined && override !== "") {
    const o = override.trim().toUpperCase();
    if (o === "-" || SHA1.test(o)) return o;
    throw new Error('MANDAT_MAC_IDENTITY must be "-" (ad-hoc) or the SHA-1 of a certificate from `security find-identity -v -p codesigning`');
  }
  /** @type {Record<string, string>} */
  const byKind = {};
  for (const line of findIdentityOutput.split("\n")) {
    const m = /^\s*\d+\)\s+([0-9A-F]{40})\s+"(Developer ID Application|Apple Development): /.exec(line);
    if (m && !byKind[m[2]]) byKind[m[2]] = m[1];
  }
  return byKind["Developer ID Application"] ?? byKind["Apple Development"] ?? "-";
}

/**
 * D-637: Apple's timestamp server is needed for notarization (Developer ID). For Apple Development and ad-hoc it only
 * makes thousands of per-file network calls (the first signed build waited 1,5 h and then failed), so it is off.
 * @param {string} findIdentityOutput @param {string} identity the result of pickMacIdentity
 * @returns {"none" | undefined}
 */
export function macTimestamp(findIdentityOutput, identity) {
  const developerId = findIdentityOutput.split("\n").some((l) => l.includes(identity) && l.includes('"Developer ID Application: '));
  return identity !== "-" && developerId ? undefined : "none";
}

function findIdentities() {
  if (process.platform !== "darwin") return "";
  try {
    return execFileSync("/usr/bin/security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

const identities = findIdentities();
const macSignIdentity = pickMacIdentity(identities, process.env.MANDAT_MAC_IDENTITY);


// MANDAT_MAC_ARCH=arm64 builds only the Apple Silicon dmg (`pnpm site:mac`, scripts/site-local-release.mjs)
const macArch = (process.env.MANDAT_MAC_ARCH ?? "arm64,x64").split(",").filter((a) => a === "arm64" || a === "x64");
const out = process.env.MANDAT_DESKTOP_OUT ? path.resolve(process.env.MANDAT_DESKTOP_OUT) : path.join(os.tmpdir(), "mandat-desktop");

/** @type {import("electron-builder").Configuration} */
export const config = {
  appId: "org.mandat.harness",
  // D-596 (Simo 24.11.2026): people see Harnova — Harnova.app, the dmg, the Dock, the menu bar (CFBundleName).
  productName: "Harnova",
  // ...but to Electron itself the app stays "Harness": that name picks its userData (~/Library/Application Support/Harness,
  // the default MANDAT_HOME is <userData>/mandat: connections, sealed keys, folder grants) and its keychain entry
  // ("Harness Safe Storage", which unlocks those keys). Renaming it would leave all of that behind, so it stays and nothing
  // is migrated. Dev (`pnpm desktop`) keeps the package name.
  extraMetadata: { productName: "Harness" },
  copyright: "GPL-3.0-or-later",
  artifactName: "Harnova-${version}-${os}-${arch}.${ext}",
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
    target: [{ target: "dmg", arch: macArch }],
    category: "public.app-category.developer-tools",
    // D-380: ad-hoc ("-") without a certificate. With no signature at all (null) a downloaded app on Apple Silicon is
    // "damaged" and cannot be opened; ad-hoc signed, Privacy & Security offers Open Anyway.
    // D-637: a Developer ID or Apple Development certificate in this Mac's keychain is used when present, so the keychain
    // stops asking for the password after every build. Hardened runtime off: it needs extra entitlements and buys nothing
    // without notarization.
    identity: macSignIdentity,
    timestamp: macTimestamp(identities, macSignIdentity),
    hardenedRuntime: false,
    // D-580, D-596: Nova (the voice) listens; without this line macOS never asks and the microphone stays silent. No camera line.
    extendInfo: { NSMicrophoneUsageDescription: "Nova listens to you through the microphone while you talk to it." },
  },
  win: { target: [{ target: "nsis", arch: ["x64"] }] },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true },
  linux: {
    executableName: "harnova",
    target: [
      { target: "AppImage", arch: ["x64"] },
      { target: "deb", arch: ["x64"] },
    ],
    category: "Development",
    maintainer: "Mandat <noreply@mandat.invalid>",
    synopsis: "Harnova: AI coding tasks in a Docker sandbox, with a verdict the agent cannot write",
  },
};

export default config;
