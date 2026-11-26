import type { Platform } from "./os";

// D-639: how to open each unsigned installer on /download (macOS: Apple Development signature without notarization,
// D-637; Windows and Linux unsigned). The text is in the catalog (src/i18n), the order here.
export const INSTALL_STEPS = {
  mac: ["install.mac.1", "install.mac.2", "install.mac.3", "install.mac.4", "install.mac.5"],
  windows: ["install.windows.1", "install.windows.2", "install.windows.3", "install.windows.4"],
  linux: ["install.linux.1", "install.linux.2", "install.linux.3", "install.linux.4", "install.linux.5"],
} as const satisfies Record<Platform, readonly string[]>;
