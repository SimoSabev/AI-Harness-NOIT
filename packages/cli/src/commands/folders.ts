import { access, lstat, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { FOLDER_ENTRIES, FOUND_PROJECTS } from "@mandat/contract";
import type { FolderEntry, FolderListing, FoundProjects } from "@mandat/contract";

// D-388 (folder picker): the "Add project" page in a browser cannot get an absolute folder path, so `mandat local` lists
// the folders of this computer for it. Only names and paths of sub-folders leave here, never a file or its contents.
// Links (symlinks, Windows junctions) are not offered and not followed; the app's own folder (MANDAT_HOME, which
// addLocalProject refuses as "inside_home") is never offered.

export interface FolderEnv {
  /** the person's home folder (os.homedir()) */
  home: string;
  /** folders never offered, nor anything inside them (MANDAT_HOME) */
  refuse: readonly string[];
  /** the drive roots; default: the existing C:\ … Z:\ on Windows, "/" elsewhere */
  roots?: () => Promise<string[]>;
  now?: () => number;
}

/** heavy, generated or system folders (compared without case) */
const SKIP = new Set([
  "node_modules", "appdata", "application data", "local settings", "library", "applications", "system volume information", "windows",
  "program files", "program files (x86)", "programdata", "recovery", "perflogs", "config.msi", "msocache", "__pycache__", "venv",
]);
/** system folders of a POSIX root */
const ROOT_SKIP = new Set(["proc", "sys", "dev", "boot", "bin", "sbin", "lib", "lib32", "lib64", "libx32", "etc", "run", "snap", "private", "cores", "lost+found", "system"]);
/** the usual places of projects, under the home folder (the home folder itself is searched last) */
const PLACES = ["Desktop", "Documents", "code", "projects", "src", "repos", "dev", "source/repos", "GitHub"];
const SEARCH_DEPTH = 2;
export const SEARCH_BUDGET_MS = 1500;

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

function inside(p: string, base: string): boolean {
  const rel = path.relative(base, p);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function defaultRoots(): Promise<string[]> {
  if (process.platform !== "win32") return ["/"];
  const letters = Array.from({ length: 24 }, (_, i) => `${String.fromCharCode(67 + i)}:\\`);
  const ok = await Promise.all(letters.map((r) => access(r).then(() => true, () => false)));
  const found = letters.filter((_, i) => ok[i]);
  return found.length > 0 ? found : ["C:\\"];
}

async function isGit(dir: string): Promise<boolean> {
  // a folder (a clone) or a file (a worktree, a submodule)
  return lstat(path.join(dir, ".git")).then((s) => s.isDirectory() || s.isFile(), () => false);
}

/** The real sub-folders of dir that may be offered (no links, nothing hidden, heavy, system or refused). */
async function subFolders(env: FolderEnv, dir: string): Promise<string[]> {
  const items = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const atRoot = path.dirname(dir) === dir;
  return items
    .filter((d) => d.isDirectory() && !d.isSymbolicLink())
    .map((d) => d.name)
    .filter((n) => !n.startsWith(".") && !n.startsWith("$") && !SKIP.has(n.toLowerCase()) && !(atRoot && ROOT_SKIP.has(n.toLowerCase())))
    .filter((n) => !env.refuse.some((r) => inside(path.join(dir, n), r)));
}

/** One folder (default: the home folder): its sub-folders, git ones first; null when it is not a folder. */
export async function listFolder(env: FolderEnv, p: string | undefined): Promise<FolderListing | null> {
  const dir = path.resolve(p ?? env.home);
  const s = await stat(dir).catch(() => null);
  if (!s?.isDirectory()) return null;
  const names = await subFolders(env, dir);
  const entries: FolderEntry[] = await Promise.all(names.map(async (name) => ({ name, path: path.join(dir, name), git: await isGit(path.join(dir, name)) })));
  const sorted = [...entries].sort((a, b) => (a.git === b.git ? byName(a.name, b.name) : a.git ? -1 : 1));
  const parent = path.dirname(dir);
  return {
    path: dir,
    parent: parent === dir ? null : parent,
    entries: sorted.slice(0, FOLDER_ENTRIES),
    roots: await (env.roots ?? defaultRoots)(),
    truncated: sorted.length > FOLDER_ENTRIES,
  };
}

/** Git projects in the usual places to depth 2, without entering a project; at most FOUND_PROJECTS, within the budget. */
export async function findProjects(env: FolderEnv, budgetMs = SEARCH_BUDGET_MS): Promise<FoundProjects> {
  const now = env.now ?? Date.now;
  const deadline = now() + budgetMs;
  const found = new Map<string, string>();
  const seen = new Set<string>();
  const bases = [...PLACES.map((p) => path.join(env.home, p)), env.home];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > SEARCH_DEPTH || found.size >= FOUND_PROJECTS || now() > deadline || seen.has(dir)) return;
    seen.add(dir);
    for (const name of await subFolders(env, dir)) {
      if (found.size >= FOUND_PROJECTS || now() > deadline) return;
      const child = path.join(dir, name);
      if (await isGit(child)) found.set(child, name);
      else await walk(child, depth + 1);
    }
  };
  for (const base of bases) {
    const s = await lstat(base).catch(() => null);
    if (s?.isDirectory() && !s.isSymbolicLink() && !env.refuse.some((r) => inside(base, r))) await walk(base, 1);
  }
  const list = [...found].map(([p, name]) => ({ name, path: p })).sort((a, b) => byName(a.name, b.name) || byName(a.path, b.path));
  return { found: list };
}
