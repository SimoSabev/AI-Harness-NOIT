import { describe, expect, it } from "vitest";
import { config, pickMacIdentity } from "../electron-builder.config.mjs";

// D-380: until Simo has an Apple Developer ID (Q-053) the Mac app is signed ad-hoc ("-"), without hardened runtime.
// Unsigned (identity null), an app downloaded from a browser on Apple Silicon is "damaged and can't be opened" with no
// way past it in System Settings; ad-hoc signed, macOS offers Privacy & Security → Open Anyway.
describe("electron-builder config (E9g A5, D-380)", () => {
  it("macOS: ad-hoc or a certificate from this Mac's keychain (by hash), no hardened runtime", () => {
    expect(config.mac?.identity).toMatch(/^(-|[0-9A-F]{40})$/);
    expect(config.mac?.hardenedRuntime).toBe(false);
  });
  it("macOS asks for the microphone (Nova, D-580, D-596) and never for the camera", () => {
    const info = (config.mac as { extendInfo?: Record<string, string> } | undefined)?.extendInfo ?? {};
    expect(info.NSMicrophoneUsageDescription).toMatch(/Nova/);
    expect(info.NSMicrophoneUsageDescription).not.toMatch(/Jarvis/);
    expect(info.NSCameraUsageDescription).toBeUndefined();
  });
  // D-596 (Simo 24.11.2026): the app people see is Harnova (Harnova.app, Harnova-<v>-mac-arm64.dmg). Electron's own name
  // inside the bundle stays Harness: it names the profile folder (~/Library/Application Support/Harness, where MANDAT_HOME
  // keeps connections, sealed keys and folder grants) and the keychain entry "Harness Safe Storage" that unlocks them, so
  // an update keeps everything without a migration. The bundle id stays too (macOS keeps its permissions by it).
  it("the app is Harnova; Electron's internal name, profile folder and keychain entry stay Harness (D-596)", () => {
    expect(config.productName).toBe("Harnova");
    expect(config.artifactName).toBe("Harnova-${version}-${os}-${arch}.${ext}");
    expect((config.extraMetadata as { productName?: string } | undefined)?.productName).toBe("Harness");
    expect(config.appId).toBe("org.mandat.harness");
    expect(config.linux?.executableName).toBe("harnova");
    expect(config.linux?.synopsis).toMatch(/^Harnova: /);
    expect(config.linux?.synopsis).not.toMatch(/Mandat/);
  });
});

// D-637 (Simo 26.11.2026, "без да трябва да пиша пароли"): every ad-hoc build has a new cdhash, and the keychain entry
// "Harness Safe Storage" trusts each cdhash separately, so every new build asked for the login password. A certificate
// with a Team ID (Apple Development from a free Apple ID in Xcode, or Developer ID) keeps the same identity across builds.
// The build picks it from `security find-identity -v -p codesigning` by its SHA-1, so nothing about it is in the repo.
describe("pickMacIdentity (D-637)", () => {
  const dev = '  1) 0123456789ABCDEF0123456789ABCDEF01234567 "Apple Development: Simo Sabev (ABCDE12345)"';
  const did = '  2) 89ABCDEF0123456789ABCDEF0123456789ABCDEF "Developer ID Application: Simo Sabev (ABCDE12345)"';
  const selfSigned = '  3) FEDCBA9876543210FEDCBA9876543210FEDCBA98 "Harnova Local"';
  const footer = "     3 valid identities found";
  it("no certificate → ad-hoc", () => {
    expect(pickMacIdentity("     0 valid identities found", undefined)).toBe("-");
    expect(pickMacIdentity("", undefined)).toBe("-");
  });
  it("Apple Development → its hash", () => {
    expect(pickMacIdentity([dev, footer].join("\n"), undefined)).toBe("0123456789ABCDEF0123456789ABCDEF01234567");
  });
  it("Developer ID wins over Apple Development", () => {
    expect(pickMacIdentity([dev, did, footer].join("\n"), undefined)).toBe("89ABCDEF0123456789ABCDEF0123456789ABCDEF");
  });
  it("a self-signed certificate has no Team ID, so it does not help and is ignored", () => {
    expect(pickMacIdentity([selfSigned, footer].join("\n"), undefined)).toBe("-");
  });
  it("MANDAT_MAC_IDENTITY wins: '-' forces ad-hoc, a hash picks that certificate", () => {
    expect(pickMacIdentity([dev, footer].join("\n"), "-")).toBe("-");
    expect(pickMacIdentity("", "89abcdef0123456789abcdef0123456789abcdef")).toBe("89ABCDEF0123456789ABCDEF0123456789ABCDEF");
  });
  it("an override that is neither '-' nor a hash is refused", () => {
    expect(() => pickMacIdentity("", "Apple Development: x")).toThrow(/MANDAT_MAC_IDENTITY/);
  });
});
