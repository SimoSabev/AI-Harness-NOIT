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
});
