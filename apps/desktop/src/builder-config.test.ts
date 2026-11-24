import { describe, expect, it } from "vitest";
import { config } from "../electron-builder.config.mjs";

// D-380: until Simo has an Apple Developer ID (Q-053) the Mac app is signed ad-hoc ("-"), without hardened runtime.
// Unsigned (identity null), an app downloaded from a browser on Apple Silicon is "damaged and can't be opened" with no
// way past it in System Settings; ad-hoc signed, macOS offers Privacy & Security → Open Anyway.
describe("electron-builder config (E9g A5, D-380)", () => {
  it("macOS: ad-hoc signature, no hardened runtime", () => {
    expect(config.mac?.identity).toBe("-");
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

