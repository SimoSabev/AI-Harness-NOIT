import path from "node:path";

// E9g A5 (D-376): where the harness lives and how the desktop starts it. In dev (`pnpm desktop`) it is the repo and
// `pnpm local`, as before. In the installed app it is the bundle in the app's resources (resources/harness, the same
// layout as the repo: packages/*/dist, apps/web/.next, supabase/, docker/, fixtures/, node_modules) run by Electron's
// own Node (ELECTRON_RUN_AS_NODE=1): no pnpm, no Node install, no repo. Docker stays required (the CLI checks it).

export interface LaunchInput {
  /** app.isPackaged */
  packaged: boolean;
  /** process.resourcesPath */
  resourcesPath: string;
  /** the repo (dev only) */
  repoRoot: string;
  /** process.execPath: the Electron binary, a Node with ELECTRON_RUN_AS_NODE=1 */
  execPath: string;
  /** app.getPath("userData"): writable, unlike the app's resources */
  userData: string;
  platform: NodeJS.Platform;
  home: string;
  env: Record<string, string | undefined>;
}

export interface HarnessLayout {
  packaged: boolean;
  /** the folder the CLI calls repoRoot (three levels up from packages/cli/dist/main.js) */
  root: string;
  cliMain: string;
  /** the harness profile folder; the desktop and the CLI must use the same one (grants, KEK, accounts) */
  mandatHome: string;
  icon: string;
}

export function harnessLayout(i: LaunchInput): HarnessLayout {
  const root = i.packaged ? path.join(i.resourcesPath, "harness") : i.repoRoot;
  // the resources are read-only (and signed later): the installed app keeps its profile in userData
  const fallback = i.packaged ? path.join(i.userData, "mandat") : path.join(i.repoRoot, ".mandat");
  const set = i.env.MANDAT_HOME;
  return {
    packaged: i.packaged,
    root,
    cliMain: path.join(root, "packages", "cli", "dist", "main.js"),
    mandatHome: path.resolve(set !== undefined && set !== "" ? set : fallback),
    icon: path.join(root, "apps", "web", "public", "icon-192.png"),
  };
}

export interface SpawnSpec {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

/**
 * A GUI app started from Finder/Dock gets a short PATH (/usr/bin:/bin:/usr/sbin:/sbin); docker lives elsewhere.
 * The usual install places are appended (never prepended: the person's own PATH wins).
 */
export function withToolPath(current: string | undefined, platform: NodeJS.Platform, home: string): string {
  const sep = platform === "win32" ? ";" : ":";
  const have = (current ?? "").split(sep).filter((p) => p !== "");
  const extra =
    platform === "darwin"
      ? ["/usr/local/bin", "/opt/homebrew/bin", "/Applications/Docker.app/Contents/Resources/bin", path.posix.join(home, ".docker", "bin"), "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
      : platform === "win32"
        ? []
        : ["/usr/local/bin", "/usr/bin", "/bin", "/snap/bin"];
  for (const p of extra) if (!have.includes(p)) have.push(p);
  return have.join(sep);
}

/**
 * How `local` is started. `base` is the env already cleaned of API keys (harnessEnv/childEnv); MANDAT_KEK may be in it.
 * MANDAT_DESKTOP_FAKE_HARNESS (a script; only in an unpackaged build) replaces the harness for the Electron e2e.
 */
export function harnessSpawn(i: LaunchInput, l: HarnessLayout, base: Record<string, string>): SpawnSpec {
  const fake = i.env.MANDAT_DESKTOP_FAKE_HARNESS;
  if (!i.packaged && fake !== undefined && fake !== "") {
    return { command: i.execPath, args: [path.resolve(fake)], cwd: i.repoRoot, env: { ...base, ELECTRON_RUN_AS_NODE: "1", MANDAT_HOME: l.mandatHome } };
  }
  if (!i.packaged) return { command: "pnpm", args: ["local"], cwd: i.repoRoot, env: { ...base } };
  return {
    command: i.execPath,
    args: [l.cliMain, "local"],
    cwd: l.root,
    env: { ...base, ELECTRON_RUN_AS_NODE: "1", MANDAT_HOME: l.mandatHome, PATH: withToolPath(base.PATH, i.platform, i.home) },
  };
}

/** A one-off CLI run (apply): `node` from the person's PATH in dev, Electron's Node in the installed app. */
export function cliSpawn(i: LaunchInput, l: HarnessLayout, argv: string[], base: Record<string, string>): SpawnSpec {
  if (!i.packaged) return { command: "node", args: [l.cliMain, ...argv], cwd: l.root, env: { ...base } };
  return {
    command: i.execPath,
    args: [l.cliMain, ...argv],
    cwd: l.root,
    env: { ...base, ELECTRON_RUN_AS_NODE: "1", MANDAT_HOME: l.mandatHome, PATH: withToolPath(base.PATH, i.platform, i.home) },
  };
}
