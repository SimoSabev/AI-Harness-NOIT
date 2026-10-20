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
  monorepo: { tool: "turbo" | "pnpm-workspaces" | "npm-workspaces" | null; turbo: boolean };
  dangerousDirs: string[];
  secretFiles: string[];
  instructions: InstructionFile[];
  configFiles: string[];
  folderTree: string[];
  srcDirs: string[];
  testDirs: string[];
  hasCss: boolean;
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
  const tool = turbo ? "turbo" : has("pnpm-workspace.yaml") ? "pnpm-workspaces" : Array.isArray(pkg.workspaces) ? "npm-workspaces" : null;
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
    monorepo: { tool, turbo },
    dangerousDirs: DANGEROUS.filter((d) => files.some((f) => f.startsWith(`${d}/`))),
    secretFiles: files.filter((f) => SECRET_NAME.test(f)),
    instructions: files.filter((f) => INSTRUCTIONS.test(f)).map((p) => {
      const text = v.read(p) ?? "";
      return { path: p, invisible: findInvisible(text), patterns: dangerousPatterns(text) };
    }),
    configFiles: files.filter((f) => CONFIG.test(f)),
    folderTree,
    srcDirs: ["src", "lib", "app", "packages", "apps"].filter((d) => dirs.includes(d)),
    testDirs: ["tests", "test", "__tests__", "e2e"].filter((d) => dirs.includes(d)),
    hasCss: files.some((f) => /\.(css|scss)$/.test(f)),
  };
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
