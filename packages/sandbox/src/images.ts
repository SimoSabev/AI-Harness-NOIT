import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const CLAUDE_CODE_VERSION = "2.1.302";
/** E9б (D12): the Playwright of the UI image (docker/sandbox-ui/Dockerfile) */
export const PLAYWRIGHT_VERSION = "1.63.0";
const ROOT_FILES = ["package.json", "pnpm-workspace.yaml", "tsconfig.base.json", "turbo.json", ".dockerignore", "pnpm-lock.yaml"];

function walk(abs: string): string[] {
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs)
    .filter((n) => n !== "node_modules" && n !== "dist")
    .flatMap((n) => walk(path.join(abs, n)));
}

function workspaceDeps(repoRoot: string, pkg: string, seen = new Set<string>()): Set<string> {
  if (seen.has(pkg)) return seen;
  seen.add(pkg);
  const pj = JSON.parse(readFileSync(path.join(repoRoot, "packages", pkg, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  for (const [name, v] of Object.entries(pj.dependencies ?? {})) {
    if (v.startsWith("workspace:") && name.startsWith("@mandat/")) workspaceDeps(repoRoot, name.slice("@mandat/".length), seen);
  }
  return seen;
}

/** D-053: first 12 hex of sha256 over sorted "<posix path>\0<sha256 of content>\n" lines. */
export function contextHash(repoRoot: string, files: string[]): string {
  const rel = [...new Set(files.map((f) => path.relative(repoRoot, f).split(path.sep).join("/")))].sort();
  const h = createHash("sha256");
  for (const r of rel) {
    const content = readFileSync(path.join(repoRoot, r));
    h.update(`${r}\0${createHash("sha256").update(content).digest("hex")}\n`);
  }
  return h.digest("hex").slice(0, 12);
}

function packageFiles(repoRoot: string, pkg: string): string[] {
  const dir = path.join(repoRoot, "packages", pkg);
  const extra = ["stub", "fakes"].map((d) => path.join(dir, d));
  return [path.join(dir, "package.json"), path.join(dir, "tsconfig.json"), ...walk(path.join(dir, "src")), ...extra.flatMap(walk)].filter(
    (f) => existsSync(f) && !f.endsWith(".test.ts"),
  );
}

function version(repoRoot: string, pkg: string): string {
  return (JSON.parse(readFileSync(path.join(repoRoot, "packages", pkg, "package.json"), "utf8")) as { version: string }).version;
}

export async function imageTags(repoRoot: string): Promise<{ sandbox: string; gate: string; proxy: string }> {
  const root = ROOT_FILES.map((f) => path.join(repoRoot, f)).filter((f) => existsSync(f));
  const forPkg = (pkg: string, dockerDir: string) =>
    contextHash(repoRoot, [
      path.join(repoRoot, "docker", dockerDir, "Dockerfile"),
      ...root,
      ...[...workspaceDeps(repoRoot, pkg)].flatMap((p) => packageFiles(repoRoot, p)),
    ].filter((f) => existsSync(f)));
  const sandbox = contextHash(repoRoot, [
    path.join(repoRoot, "docker", "sandbox", "Dockerfile"),
    ...root,
    ...walk(path.join(repoRoot, "packages", "agents", "fakes")),
    ...walk(path.join(repoRoot, "packages", "agents", "hooks")),
    ...walk(path.join(repoRoot, "packages", "verify", "reporters")),
    // E8e: the MCP sidecar bridge and its workspace dependencies are built into the image
    ...(existsSync(path.join(repoRoot, "packages", "mcp-bridge", "package.json")) ? [...workspaceDeps(repoRoot, "mcp-bridge")].flatMap((p) => packageFiles(repoRoot, p)) : []),
    // E4: the replay recordings and patches are copied into the image (not the *.webm videos)
    ...walk(path.join(repoRoot, "demo", "recordings")).filter((f) => /\.(jsonl|patch)$/.test(f)),
  ].filter((f) => existsSync(f)));
  return {
    sandbox: `mandat-sandbox:cc${CLAUDE_CODE_VERSION}-${sandbox}`,
    gate: `mandat-egress-gate:v${version(repoRoot, "egress-gate")}-${forPkg("egress-gate", "egress-gate")}`,
    proxy: `mandat-llm-proxy:v${version(repoRoot, "llm-proxy")}-${forPkg("llm-proxy", "llm-proxy")}`,
  };
}

/** E9б (D12, D-364): the browser image of the UI check — built only on demand (`mandat images build --ui`) */
export function uiImageTag(repoRoot: string): string {
  const files = [path.join(repoRoot, "docker", "sandbox-ui", "Dockerfile"), ...walk(path.join(repoRoot, "packages", "verify", "ui-runner"))].filter((f) => existsSync(f));
  return `mandat-sandbox-ui:pw${PLAYWRIGHT_VERSION}-${contextHash(repoRoot, files)}`;
}

