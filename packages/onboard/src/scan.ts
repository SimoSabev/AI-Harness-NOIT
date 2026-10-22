import { skillsFromView } from "./skills.js";
import type { RepoSkill } from "./skills.js";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { dangerousPatterns, findInvisible } from "./invisible.js";
import type { InvisibleHit } from "./invisible.js";

// Демо промпт т. 8.2 (2): the scanner without AI. Input is a read-only view of a clean clone (hooks off); it reads
// file NAMES for secrets (never their content) and only the files it needs (lockfiles, package.json, workflows,
// instruction files).
export interface RepoView {
  files: string[]; // posix, relative
  read(p: string): string | null;
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";
export type Framework = "vitest" | "jest" | "mocha" | "node";
export type Light = "green" | "yellow" | "red";
export interface WorkflowInfo { path: string; permissions: "unset" | "read" | "write"; light: Light; testJobs: string[] }
/** E8и (D-358): a workspace package — a directory with package.json matched by the workspace globs */
export interface WorkspacePackage { dir: string; name: string; srcDirs: string[]; testDirs: string[] }
export interface InstructionFile { path: string; invisible: InvisibleHit[]; patterns: string[] }
export interface ScanResult {
  packageManager: PackageManager | null;
  lockfile: string | null;
  node: "20" | "22" | "24";
  nodeSource: string;
  scripts: Record<string, string>;
  framework: Framework | null;
  frameworkSource: string | null;
  workflows: WorkflowInfo[];
  docker: boolean;
  monorepo: { tool: "turbo" | "pnpm-workspaces" | "npm-workspaces" | null; turbo: boolean; packages: WorkspacePackage[] };
  /** E8и: yarn.lock is berry's (`__metadata`), installed with `yarn install --immutable` */
  yarnBerry: boolean;
  dangerousDirs: string[];
  secretFiles: string[];
  instructions: InstructionFile[];
  configFiles: string[];
  folderTree: string[];
  srcDirs: string[];
  testDirs: string[];
  hasCss: boolean;
  /** E8б: style facts from .editorconfig / prettier / eslint config (file names and indent only) */
  style: string[];
  /** E8e: the repo's skills (without their text); blocked = an invisible character */
  skills: Omit<RepoSkill, "text">[];
}

const LOCKFILES: [string, PackageManager][] = [["pnpm-lock.yaml", "pnpm"], ["package-lock.json", "npm"], ["yarn.lock", "yarn"], ["bun.lockb", "bun"], ["bun.lock", "bun"]];
const INSTRUCTIONS = /^(AGENTS\.md|CLAUDE\.md|GEMINI\.md|\.cursorrules|\.windsurfrules|\.github\/copilot-instructions\.md|\.cursor\/rules\/.+|\.claude\/.+\.md|\.codex\/.+)$/;
const SECRET_NAME = /(^|\/)(\.env(\..+)?|.+\.pem|.+\.key|id_rsa|id_ed25519|.+\.p12|.+\.pfx|credentials\.json|\.npmrc|\.netrc|secrets?\.(json|ya?ml))$/;
const DANGEROUS = [".github/workflows", ".husky", ".claude", ".codex", ".vscode", ".devcontainer", ".cursor"];
const CONFIG = /^(vitest|vite|jest|playwright|tsconfig[^/]*|babel|webpack|rollup|eslint)\.config\.[cm]?[jt]s$|^tsconfig[^/]*\.json$|^\.npmrc$|^turbo\.json$|^pnpm-workspace\.yaml$/;
const NODE = /^(20|22|24)(\.|$)/;

function json(v: RepoView, p: string): Record<string, unknown> | null {
  const t = v.read(p);
  if (t === null) return null;
  try {
    const x: unknown = JSON.parse(t);
    return x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
const rec = (x: unknown): Record<string, string> =>
  x !== null && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [string, string][]) : {};

function workflow(v: RepoView, p: string): WorkflowInfo {
  let doc: unknown;
  try {
    doc = parseYaml(v.read(p) ?? "");
  } catch {
    doc = null;
  }
  const d = (doc ?? {}) as { permissions?: unknown; jobs?: Record<string, { permissions?: unknown; steps?: { run?: unknown }[] }> };
  const perms = [d.permissions, ...Object.values(d.jobs ?? {}).map((j) => j?.permissions)];
  const writes = perms.some((x) => x === "write-all" || (x !== null && typeof x === "object" && Object.values(x as Record<string, unknown>).includes("write")));
  const set = d.permissions !== undefined;
  const testJobs = Object.entries(d.jobs ?? {})
    .filter(([, j]) => (j?.steps ?? []).some((s) => typeof s?.run === "string" && /\b(test|vitest|jest|mocha)\b/.test(s.run)))
    .map(([k]) => k);
  const permissions = writes ? "write" : set ? "read" : "unset";
  return { path: p, permissions, light: writes ? "red" : set ? "green" : "yellow", testJobs };
}

const SRC_DIRS = ["src", "lib", "app", "packages", "apps"];
const TEST_DIRS = ["tests", "test", "__tests__", "e2e"];
/** a workspace glob → RegExp over a directory path: `*` one segment, `**` any depth (no braces, no character classes) */
function wsGlob(g: string): RegExp {
  const body = g.replace(/^\.\//, "").replace(/\/+$/, "").split("/").map((seg) => (seg === "**" ? "(?:.+)" : seg.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]"))).join("/");
  return new RegExp(`^${body}$`);
}
/** the workspace globs: pnpm-workspace.yaml `packages:`, else package.json `workspaces` (array, or yarn's {packages}) */
function workspaceGlobs(v: RepoView, pkg: Record<string, unknown>): string[] {
  const text = v.read("pnpm-workspace.yaml");
  if (text !== null) {
    try {
      const doc = parseYaml(text) as { packages?: unknown } | null;
      return Array.isArray(doc?.packages) ? doc.packages.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  const ws = pkg.workspaces;
  const list = Array.isArray(ws) ? ws : ws !== null && typeof ws === "object" && Array.isArray((ws as { packages?: unknown }).packages) ? (ws as { packages: unknown[] }).packages : [];
  return list.filter((x): x is string => typeof x === "string");
}
function workspacePackages(v: RepoView, files: string[], pkg: Record<string, unknown>): WorkspacePackage[] {
  const globs = workspaceGlobs(v, pkg);
  const include = globs.filter((g) => !g.startsWith("!")).map(wsGlob);
  const exclude = globs.filter((g) => g.startsWith("!")).map((g) => wsGlob(g.slice(1)));
  const dirs = files.filter((f) => f.endsWith("/package.json")).map((f) => f.slice(0, -"/package.json".length));
  return dirs
    .filter((d) => include.some((r) => r.test(d)) && !exclude.some((r) => r.test(d)))
    .sort()
    .map((dir) => {
      const sub = new Set(files.filter((f) => f.startsWith(`${dir}/`)).map((f) => f.slice(dir.length + 1).split("/")).filter((p) => p.length > 1).map((p) => p[0] as string));
      const name = json(v, `${dir}/package.json`)?.name;
      return { dir, name: typeof name === "string" ? name : dir, srcDirs: SRC_DIRS.filter((d) => sub.has(d)), testDirs: TEST_DIRS.filter((d) => sub.has(d)) };
    });
}

export function scanRepo(v: RepoView): ScanResult {
  const files = [...v.files].sort();
  const has = (p: string) => files.includes(p);
  const lock = LOCKFILES.find(([f]) => has(f)) ?? null;
  const pkg = json(v, "package.json") ?? {};
  const scripts = rec(pkg.scripts);
  const deps = { ...rec(pkg.dependencies), ...rec(pkg.devDependencies) };
  const testScript = scripts.test ?? "";
  let framework: Framework | null = null;
  let frameworkSource: string | null = null;
  for (const f of ["vitest", "jest", "mocha"] as const) {
    if (new RegExp(`\\b${f}\\b`).test(testScript)) {
      framework = f;
      frameworkSource = "package.json#scripts.test";
      break;
    }
  }
  if (!framework) {
    const f = (["vitest", "jest", "mocha"] as const).find((x) => x in deps);
    if (f) {
      framework = f;
      frameworkSource = "lockfile";
    } else if (/node\s+--test/.test(testScript)) {
      framework = "node";
      frameworkSource = "package.json#scripts.test";
    }
  }
  const nvm = (v.read(".nvmrc") ?? v.read(".node-version") ?? "").trim().replace(/^v/, "");
  const engines = rec(pkg.engines).node ?? "";
  const engineMajor = /(20|22|24)/.exec(engines)?.[1] ?? "";
  const node = (NODE.test(nvm) ? nvm.slice(0, 2) : engineMajor || "24") as "20" | "22" | "24";
  const nodeSource = NODE.test(nvm) ? (has(".nvmrc") ? ".nvmrc" : ".node-version") : engineMajor ? "package.json#engines.node" : "default";
  const workflows = files.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f)).map((f) => workflow(v, f));
  const turbo = has("turbo.json");
  const tool = turbo ? "turbo" : has("pnpm-workspace.yaml") ? "pnpm-workspaces" : pkg.workspaces !== undefined && pkg.workspaces !== null ? "npm-workspaces" : null;
  const top = (f: string) => f.split("/")[0] ?? f;
  const dirs = [...new Set(files.filter((f) => f.includes("/")).map(top))];
  const folderTree = [...new Set(files.filter((f) => f.includes("/")).map((f) => f.split("/").slice(0, Math.min(2, f.split("/").length - 1)).join("/")))].sort();
  return {
    packageManager: lock ? lock[1] : null,
    lockfile: lock ? lock[0] : null,
    node,
    nodeSource,
    scripts,
    framework,
    frameworkSource,
    workflows,
    docker: files.some((f) => /(^|\/)(Dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$/.test(f)),
    monorepo: { tool, turbo, packages: workspacePackages(v, files, pkg) },
    yarnBerry: lock?.[1] === "yarn" && /^__metadata:/m.test(v.read("yarn.lock") ?? ""),
    dangerousDirs: DANGEROUS.filter((d) => files.some((f) => f.startsWith(`${d}/`))),
    secretFiles: files.filter((f) => SECRET_NAME.test(f)),
    instructions: files.filter((f) => INSTRUCTIONS.test(f)).map((p) => {
      const text = v.read(p) ?? "";
      return { path: p, invisible: findInvisible(text), patterns: dangerousPatterns(text) };
    }),
    configFiles: files.filter((f) => CONFIG.test(f)),
    folderTree,
    srcDirs: SRC_DIRS.filter((d) => dirs.includes(d)),
    testDirs: TEST_DIRS.filter((d) => dirs.includes(d)),
    hasCss: files.some((f) => /\.(css|scss)$/.test(f)),
    style: styleFacts(v, files),
    skills: skillsFromView(v).map(({ text: _text, ...rest }) => rest),
  };
}

function styleFacts(v: RepoView, files: string[]): string[] {
  const out: string[] = [];
  const ec = files.includes(".editorconfig") ? (v.read(".editorconfig") ?? "") : "";
  const indentStyle = /^\s*indent_style\s*=\s*(space|tab)/m.exec(ec)?.[1];
  const indentSize = /^\s*indent_size\s*=\s*(\d{1,2})/m.exec(ec)?.[1];
  if (indentStyle === "tab") out.push("indent: tabs (.editorconfig)");
  else if (indentStyle === "space" && indentSize) out.push(`indent: ${indentSize} spaces (.editorconfig)`);
  const prettier = files.find((f) => /^\.prettierrc(\.(json|ya?ml|js|cjs|mjs))?$|^prettier\.config\.[cm]?js$/.test(f));
  if (prettier) out.push(`formatter: prettier (${prettier})`);
  const eslint = files.find((f) => /^(\.eslintrc(\.(json|ya?ml|js|cjs))?|eslint\.config\.[cm]?[jt]s)$/.test(f));
  if (eslint) out.push(`linter: eslint (${eslint})`);
  return out;
}

/** A view over a checked-out directory (skips .git and node_modules; symlinks are listed but not followed). */
export function dirView(root: string): RepoView {
  const files: string[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(path.join(root, rel))) {
      if (name === ".git" || name === "node_modules") continue;
      const r = rel ? `${rel}/${name}` : name;
      const st = lstatSync(path.join(root, r));
      if (st.isDirectory()) walk(r);
      else files.push(r);
    }
  };
  walk("");
  return {
    files,
    read: (p) => {
      const abs = path.join(root, p);
      if (!existsSync(abs) || lstatSync(abs).isSymbolicLink() || SECRET_NAME.test(p)) return null; // never secret contents
      const st = lstatSync(abs);
      return st.isFile() && st.size <= 1024 * 1024 ? readFileSync(abs, "utf8") : null;
    },
  };
}
