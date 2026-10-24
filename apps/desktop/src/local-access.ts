import path from "node:path";
import type { LocalGrant, LocalScope } from "@mandat/contract";

// E9g A3 (AC-12.6, D-373): the desktop sees nothing on disk until the person grants a folder. These are the pure checks
// behind every grant and every use of one: the real path (symlinks resolved), no "/" or a drive root, not the home
// folder as a whole (nor its ancestors), no system folder, no secrets folder, not the harness profile (MANDAT_HOME);
// and every path a local action touches must be inside a granted folder that has the scope the action needs.

export interface PathEnv {
  platform: NodeJS.Platform;
  /** the person's home folder (os.homedir()) */
  home: string;
  /** the harness profile folder, where the grants and the sealed keys live */
  mandatHome: string;
  /** fs.realpathSync.native; throws when the path does not exist */
  realpath: (p: string) => string;
  isDirectory: (p: string) => boolean;
}

export type GrantRefusal = "missing" | "not_a_folder" | "root" | "home" | "system" | "secrets" | "profile";
export type GrantCheck = { ok: true; path: string } | { ok: false; reason: GrantRefusal };
export type UseCheck = { ok: true; path: string; grant: LocalGrant } | { ok: false; reason: "missing" | "not_granted" | "no_scope" };

const POSIX_SYSTEM = [
  "/bin", "/sbin", "/usr", "/etc", "/dev", "/proc", "/sys", "/boot", "/lib", "/lib32", "/lib64", "/root", "/run", "/snap",
  "/var/lib", "/var/log", "/var/db", "/var/root", "/System", "/Library", "/Applications", "/cores",
  "/private/etc", "/private/var/db", "/private/var/root", "/private/var/log",
];
const WIN_SYSTEM = /^[a-z]:\\(windows|program files|program files \(x86\)|programdata|recovery|\$recycle\.bin|system volume information)(\\|$)/;
/** Inside the home folder: credentials, keychains and app data. */
const HOME_SECRETS = [".ssh", ".gnupg", ".aws", ".azure", ".kube", ".docker", ".config", ".password-store", ".local/share/keyrings", "Library", "AppData"];

const lib = (platform: NodeJS.Platform) => (platform === "win32" ? path.win32 : path.posix);
/** macOS and Windows file systems are case-insensitive by default: the refusals compare lower case to be safe. */
const fold = (p: string, platform: NodeJS.Platform) => (platform === "win32" || platform === "darwin" ? p.toLowerCase() : p);

/** child is parent itself or below it, by whole path segments (/a/bc is not inside /a/b). */
export function isInside(child: string, parent: string, platform: NodeJS.Platform): boolean {
  const rel = lib(platform).relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !lib(platform).isAbsolute(rel));
}

function insideFolded(child: string, parent: string, platform: NodeJS.Platform): boolean {
  return isInside(fold(child, platform), fold(parent, platform), platform);
}

function real(p: string, env: PathEnv): string | null {
  try {
    return lib(env.platform).normalize(env.realpath(p));
  } catch {
    return null;
  }
}

/** May this folder be granted? The answer carries the real path, which is what gets stored. */
export function checkGrantable(p: string, env: PathEnv): GrantCheck {
  const r = real(p, env);
  if (r === null) return { ok: false, reason: "missing" };
  const P = lib(env.platform);
  if (P.parse(r).root === r || P.dirname(r) === r) return { ok: false, reason: "root" };
  const home = real(env.home, env) ?? P.normalize(env.home);
  if (insideFolded(home, r, env.platform)) return { ok: false, reason: "home" }; // home itself or one of its ancestors
  // a system folder, inside one, or (E9g review) one that holds a system folder: /var above /var/lib, /private above /private/etc
  if (env.platform === "win32" ? WIN_SYSTEM.test(fold(r, env.platform)) : POSIX_SYSTEM.some((s) => insideFolded(r, s, env.platform) || insideFolded(s, r, env.platform))) return { ok: false, reason: "system" };
  if (HOME_SECRETS.some((s) => insideFolded(r, P.join(home, s), env.platform))) return { ok: false, reason: "secrets" };
  const profile = real(env.mandatHome, env) ?? P.normalize(env.mandatHome);
  if (insideFolded(r, profile, env.platform)) return { ok: false, reason: "profile" };
  if (!env.isDirectory(r)) return { ok: false, reason: "not_a_folder" };
  return { ok: true, path: r };
}

/**
 * May a local action with this scope touch this path? Its real path must be inside a granted folder with the scope.
 * E9g review: a stored grant counts only while its folder could still be granted (checkGrantable), so a hand-edited or
 * older grants file with "/", the home folder or a system folder gives nothing.
 */
export function authorize(p: string, scope: LocalScope, grants: readonly LocalGrant[], env: PathEnv): UseCheck {
  const r = real(p, env);
  if (r === null) return { ok: false, reason: "missing" };
  const holders = grants.filter((g) => isInside(r, g.path, env.platform) && checkGrantable(g.path, env).ok);
  if (holders.length === 0) return { ok: false, reason: "not_granted" };
  const grant = holders.find((g) => g.scopes.includes(scope));
  return grant ? { ok: true, path: r, grant } : { ok: false, reason: "no_scope" };
}

const ORDER: readonly LocalScope[] = ["read", "apply", "open_editor", "terminal"];
const sorted = (s: Iterable<LocalScope>): LocalScope[] => ORDER.filter((x) => new Set(s).has(x));

/** A new grant, or more scopes on the same folder (granted_at is the time of the last change). */
export function addGrant(grants: readonly LocalGrant[], realPath: string, scopes: readonly LocalScope[], now: Date): { grants: LocalGrant[]; grant: LocalGrant } {
  const old = grants.find((g) => g.path === realPath);
  const grant: LocalGrant = { path: realPath, scopes: sorted([...(old?.scopes ?? []), ...scopes]), granted_at: now.toISOString() };
  return { grants: [...grants.filter((g) => g.path !== realPath), grant].sort((a, b) => a.path.localeCompare(b.path)), grant };
}

/** Takes scopes away; without scopes, or when none is left, the folder is forgotten. Unknown folders change nothing. */
export function removeGrant(grants: readonly LocalGrant[], p: string, scopes?: readonly LocalScope[]): LocalGrant[] {
  return grants.flatMap((g) => {
    if (g.path !== p) return [g];
    if (!scopes) return [];
    const left = g.scopes.filter((s) => !scopes.includes(s));
    return left.length === 0 ? [] : [{ ...g, scopes: sorted(left) }];
  });
}

/** "Open with" / a second start of the app: the absolute paths among the arguments (no flags, not the app itself). */
export function folderArgs(argv: readonly string[], platform: NodeJS.Platform, self: readonly string[]): string[] {
  const P = lib(platform);
  const mine = new Set(self.map((s) => fold(P.normalize(s), platform)));
  return argv
    .slice(1)
    .filter((a) => !a.startsWith("-") && P.isAbsolute(a) && !/\.(exe|app|asar|js|cjs|mjs)$/i.test(a) && !mine.has(fold(P.normalize(a), platform)));
}
