// E9g A4 (D-375): node-pty's own install scripts are not run (pnpm-workspace.yaml allowBuilds: false); its prebuilt
// binaries are used as they are. The 1.1.0 tarball ships prebuilds/<os>-<arch>/spawn-helper without the executable bit
// (seen 24.10.2026: `tar tvzf node-pty-1.1.0.tgz` → -rw-r--r--), and without it every spawn fails ("posix_spawnp failed").
// There is no Linux prebuild: the host terminal then answers not_ready until a native build exists ([НП], A5).
import { chmodSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
let root;
try {
  root = path.dirname(require.resolve("node-pty/package.json"));
} catch {
  console.log("setup-pty: node-pty is not installed; the host terminal is off");
  process.exit(0);
}
const dir = path.join(root, "prebuilds", `${process.platform}-${process.arch}`);
const built = path.join(root, "build", "Release", "pty.node");
if (!existsSync(dir) && !existsSync(built)) {
  console.log(`setup-pty: no node-pty binary for ${process.platform}-${process.arch}; the host terminal is off (D-375)`);
  process.exit(0);
}
for (const helper of [path.join(dir, "spawn-helper"), path.join(root, "build", "Release", "spawn-helper")]) {
  if (existsSync(helper)) chmodSync(helper, 0o755);
}
console.log(`setup-pty: node-pty ready for ${process.platform}-${process.arch}`);
