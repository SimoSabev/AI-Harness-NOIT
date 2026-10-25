import path from "node:path";
import { describe, expect, it } from "vitest";
import { cliSpawn, harnessLayout, harnessSpawn, withToolPath } from "./harness-launch.js";
import type { LaunchInput } from "./harness-launch.js";

const dev: LaunchInput = {
  packaged: false,
  resourcesPath: "/x/Electron.app/Contents/Resources",
  repoRoot: "/repo",
  execPath: "/x/Electron.app/Contents/MacOS/Electron",
  userData: "/Users/s/Library/Application Support/Harness",
  platform: "darwin",
  home: "/Users/s",
  env: {},
};
const app: LaunchInput = { ...dev, packaged: true, resourcesPath: "/Applications/Harness.app/Contents/Resources", execPath: "/Applications/Harness.app/Contents/MacOS/Harness" };

describe("harness layout (E9g A5, D-376)", () => {
  it("dev: the repo and its .mandat, as `pnpm local` uses them", () => {
    const l = harnessLayout(dev);
    expect(l.root).toBe("/repo");
    expect(l.cliMain).toBe(path.join("/repo", "packages/cli/dist/main.js"));
    expect(l.mandatHome).toBe(path.resolve("/repo/.mandat"));
    expect(l.icon).toBe(path.join("/repo", "apps/web/public/icon-192.png"));
  });
  it("installed: the bundle in resources/harness; the profile in userData (resources are read-only)", () => {
    const l = harnessLayout(app);
    expect(l.root).toBe(path.join(app.resourcesPath, "harness"));
    expect(l.cliMain).toBe(path.join(app.resourcesPath, "harness/packages/cli/dist/main.js"));
    expect(l.mandatHome).toBe(path.resolve(app.userData, "mandat"));
  });
  it("the Dock icon (D-391): only when started from the code on macOS — the installed app's bundle has its own icon", () => {
    expect(harnessLayout({ ...dev, platform: "darwin" }).dockIcon).toBe(path.join("/repo", "apps/web/public/icon-512.png"));
    expect(harnessLayout({ ...app, platform: "darwin" }).dockIcon).toBeNull();
    expect(harnessLayout({ ...dev, platform: "linux" }).dockIcon).toBeNull();
  });
  it("the menu-bar icon: a black template image on macOS (the system tints it), the app icon elsewhere (D-382)", () => {
    expect(harnessLayout(dev).trayIcon).toBe(path.join("/repo", "apps/web/public/trayTemplate.png"));
    expect(harnessLayout({ ...dev, platform: "win32" }).trayIcon).toBe(path.join("/repo", "apps/web/public/icon-192.png"));
    expect(harnessLayout({ ...app, platform: "linux" }).trayIcon).toBe(path.join(app.resourcesPath, "harness/apps/web/public/icon-192.png"));
  });
  it("MANDAT_HOME set by the person wins in both", () => {
    expect(harnessLayout({ ...app, env: { MANDAT_HOME: "/data/h" } }).mandatHome).toBe(path.resolve("/data/h"));
    expect(harnessLayout({ ...dev, env: { MANDAT_HOME: "" } }).mandatHome).toBe(path.resolve("/repo/.mandat"));
  });
});

describe("how the harness starts (E9g A5, D-376)", () => {
  it("dev: Electron's own Node (24.22.0) runs the repo's built CLI, never the Node on PATH (Node 26 is refused, D-380)", () => {
    const l = harnessLayout(dev);
    const s = harnessSpawn(dev, l, { PATH: "/bin", MANDAT_KEK: "k" });
    expect(s).toEqual({ command: dev.execPath, args: [l.cliMain, "local"], cwd: "/repo", env: { PATH: "/bin", MANDAT_KEK: "k", ELECTRON_RUN_AS_NODE: "1" } });
  });
  it("installed: Electron's own Node runs the bundled CLI — no pnpm, no Node install; MANDAT_HOME = the desktop's profile", () => {
    const l = harnessLayout(app);
    const s = harnessSpawn(app, l, { PATH: "/usr/bin:/bin", MANDAT_KEK: "k" });
    expect(s.command).toBe(app.execPath);
    expect(s.args).toEqual([l.cliMain, "local"]);
    expect(s.cwd).toBe(l.root);
    expect(s.env.ELECTRON_RUN_AS_NODE).toBe("1");
    expect(s.env.MANDAT_HOME).toBe(l.mandatHome);
    expect(s.env.MANDAT_KEK).toBe("k");
    expect(s.env.PATH?.split(":")).toContain("/usr/local/bin");
    expect(s.env.PATH?.startsWith("/usr/bin:/bin")).toBe(true);
  });
  it("the e2e fake harness only in an unpackaged build; the installed app ignores it", () => {
    const env = { MANDAT_DESKTOP_FAKE_HARNESS: "/repo/apps/desktop/e2e/fake-harness.mjs" };
    const d = harnessSpawn({ ...dev, env }, harnessLayout({ ...dev, env }), {});
    expect(d.command).toBe(dev.execPath);
    expect(d.args).toEqual([path.resolve(env.MANDAT_DESKTOP_FAKE_HARNESS)]);
    expect(d.env.ELECTRON_RUN_AS_NODE).toBe("1");
    const a = harnessSpawn({ ...app, env }, harnessLayout({ ...app, env }), {});
    expect(a.args).toEqual([harnessLayout(app).cliMain, "local"]);
  });
  it("apply: Electron's Node in dev and in the installed app; never the KEK unless the caller put it there", () => {
    expect(cliSpawn(dev, harnessLayout(dev), ["apply"], { PATH: "/bin" })).toEqual({ command: dev.execPath, args: [path.join("/repo", "packages/cli/dist/main.js"), "apply"], cwd: "/repo", env: { PATH: "/bin", ELECTRON_RUN_AS_NODE: "1" } });
    const s = cliSpawn(app, harnessLayout(app), ["--json", "apply"], { PATH: "/bin" });
    expect(s.command).toBe(app.execPath);
    expect(s.env).toMatchObject({ ELECTRON_RUN_AS_NODE: "1", MANDAT_HOME: harnessLayout(app).mandatHome });
    expect(s.env.MANDAT_KEK).toBeUndefined();
  });
});

describe("PATH of a GUI app (E9g A5)", () => {
  it("macOS: docker's usual places are appended once, the person's PATH stays first", () => {
    const p = withToolPath("/usr/bin:/bin:/usr/sbin:/sbin", "darwin", "/Users/s").split(":");
    expect(p.slice(0, 4)).toEqual(["/usr/bin", "/bin", "/usr/sbin", "/sbin"]);
    expect(p).toContain("/opt/homebrew/bin");
    expect(p).toContain("/Applications/Docker.app/Contents/Resources/bin");
    expect(p).toContain("/Users/s/.docker/bin");
    expect(new Set(p).size).toBe(p.length);
  });
  it("Linux appends /usr/local/bin and /snap/bin; Windows is left as it is", () => {
    expect(withToolPath(undefined, "linux", "/home/s").split(":")).toEqual(["/usr/local/bin", "/usr/bin", "/bin", "/snap/bin"]);
    expect(withToolPath("C:\\Windows;C:\\Docker", "win32", "C:\\Users\\s")).toBe("C:\\Windows;C:\\Docker");
  });
});
