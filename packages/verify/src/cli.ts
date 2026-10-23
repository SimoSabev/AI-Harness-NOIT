import { lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MandatError, TaskType, parseMandatYml, ulid } from "@mandat/contract";
import type { ChangedFile, ErrorCode, VerifyOutcome } from "@mandat/contract";
import { ev } from "@mandat/core";
import { exportChangeset } from "@mandat/export";
import { createRedactor } from "@mandat/redaction";
import { compareVersions, dockerText, ensureUpstreamNetwork, imageTags, names, probeIpv6, realDockerRunner } from "@mandat/sandbox";
import type { DockerRunner } from "@mandat/sandbox";
import { hostConfig, infraUserFor } from "./host.js";
import { acquireRunLock } from "./lock.js";
import { RunWriter } from "./run-dir.js";
import { readAtBase, resolveTrustedBase } from "./trusted-base.js";
import { verifyChange } from "./verify-change.js";
import type { PolicyInput, VerifyDeps } from "./verify-change.js";
import type { HiddenTests } from "./verify-trees.js";
import { tarOf, workingTreeFiles } from "./worktree.js";

// Демо промпт т. 5.7: `mandat-verify --repo <dir> --remote <url> [--type <task_type>] [--external] [--json] [--home <dir>]`.
// Exit: 0 VERIFIED, 10 UNKNOWN, 20 FAILED, 2 usage, 3 environment. Never writes to the user's .git and never reads SUPABASE_* (S35).

export interface VerifyIo {
  stdout: (s: string) => void;
  stderr: (s: string) => void;
  env: Record<string, string | undefined>;
  cwd: string;
}
export interface VerifyCliDeps {
  docker?: DockerRunner;
  images?: { sandbox: string; gate: string; proxy: string };
  repoRoot?: string;
  verify?: Partial<Pick<VerifyDeps, "runTests" | "startGate" | "recompute" | "ipv6Sysctl" | "infraUser" | "now">>;
}
export interface VerifyArgs {
  repo: string;
  remote: string | null;
  type: TaskType | null;
  external: boolean;
  json: boolean;
  home: string;
  /** v5 E9б (D5): a directory of a person's hidden tests (copied into tree B only) */
  hidden: string | null;
}

const TASK_TYPES = TaskType.options; // D-360: "free" too
const ZERO = "0".repeat(40);
const defaultRepoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");

export function parseVerifyArgs(argv: string[], io: VerifyIo): { ok: true; args: VerifyArgs } | { ok: false; error: string } {
  const a: Partial<VerifyArgs> & { external: boolean; json: boolean } = { external: false, json: false };
  for (let k = 0; k < argv.length; k++) {
    const f = argv[k];
    const val = () => {
      const v = argv[++k];
      if (v === undefined || v.startsWith("--")) throw new Error(`${f} needs a value`);
      return v;
    };
    try {
      if (f === "--repo") a.repo = path.resolve(io.cwd, val());
      else if (f === "--remote") a.remote = val();
      else if (f === "--type") {
        const t = val();
        if (!(TASK_TYPES as readonly string[]).includes(t)) return { ok: false, error: `unknown --type ${t}` };
        a.type = t as TaskType;
      } else if (f === "--home") a.home = path.resolve(io.cwd, val());
      else if (f === "--external") a.external = true;
      else if (f === "--json") a.json = true;
      else if (f === "--hidden") a.hidden = path.resolve(io.cwd, val());
      else return { ok: false, error: `unknown argument ${f ?? ""}` };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  if (!a.repo) return { ok: false, error: "--repo is required" };
  const home = a.home ?? io.env.MANDAT_HOME ?? path.join(os.homedir(), ".mandat");
  return { ok: true, args: { repo: a.repo, remote: a.remote ?? null, type: a.type ?? null, external: a.external, json: a.json, home, hidden: a.hidden ?? null } };
}

const REASON_LABEL: Record<string, string> = {
  external_cap: "external cap", parent_cap: "caller cap", risk_cap: "risk cap", unknown: "unknown", ruleset_missing: "no ruleset", d7_missing: "no CI signal",
};

export function formatOutcome(o: VerifyOutcome, base: { sha: string; remote: string | null; branch: string | null }): string {
  const v = o.verdict;
  const lines = [v.result === "VERIFIED" ? "VERDICT: VERIFIED" : `VERDICT: ${v.result}  reasons: ${v.reasons.join(", ")}`];
  const parts = v.evidence.map((e) => `${e.detector} ${e.status}${e.status !== "pass" && e.status !== "n/a" && e.signature ? ` (${e.signature})` : ""}`);
  for (let i = 0; i < parts.length; i += 5) lines.push(`  ${parts.slice(i, i + 5).join(" · ")}`);
  const ordered = [...o.level_reasons].sort((x, y) => (x === "external_cap" ? -1 : y === "external_cap" ? 1 : 0));
  lines.push(`level: ${o.effective_level}${ordered.length ? ` (${ordered.map((r) => REASON_LABEL[r] ?? r).join(", ")})` : ""}`);
  lines.push(base.remote ? `base: ${base.sha.slice(0, 12)} (trusted ${base.remote} ${base.branch ?? "?"})` : `base: untrusted`);
  if (o.ledger) lines.push(`ledger: seq ${o.ledger.from}..${o.ledger.to}`);
  return lines.join("\n") + "\n";
}

/** D5: the hidden test files of a directory (≤ 200 files, ≤ 5 MB in all; no symlinks); copied into tree B as tests/__hidden__/… */
export function readHidden(dir: string): HiddenTests {
  const files: HiddenTests["files"] = [];
  let bytes = 0;
  const walk = (rel: string) => {
    for (const n of readdirSync(path.join(dir, rel)).sort()) {
      const r = rel ? `${rel}/${n}` : n;
      const st = lstatSync(path.join(dir, r));
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) walk(r);
      else if (st.isFile()) {
        bytes += st.size;
        if (files.length >= 200 || bytes > 5 * 1024 * 1024) throw new MandatError("E_USAGE", "hidden tests: at most 200 files and 5 MB");
        files.push({ path: r, data: readFileSync(path.join(dir, r)) });
      }
    }
  };
  walk("");
  return { dir: "tests/__hidden__", files };
}

export const exitFor = (r: string): 0 | 10 | 20 => (r === "VERIFIED" ? 0 : r === "UNKNOWN" ? 10 : 20);

export async function mandatVerify(argv: string[], io: VerifyIo, deps: VerifyCliDeps = {}): Promise<number> {
  const parsed = parseVerifyArgs(argv, io);
  if (!parsed.ok) {
    io.stderr(`mandat-verify: ${parsed.error}\nusage: mandat-verify --repo <dir> --remote <url> [--type <task_type>] [--external] [--hidden <dir>] [--json] [--home <dir>]\n`);
    return 2;
  }
  const a = parsed.args;
  const envFail = (code: ErrorCode, message: string): number => {
    if (a.json) io.stdout(JSON.stringify({ error: { code, message }, exit: 3 }) + "\n");
    else io.stderr(`ERROR ${code}: ${message}\n`);
    return 3;
  };
  let release: () => void;
  try {
    release = acquireRunLock(a.home);
  } catch (e) {
    return envFail("E_LOCKED", (e as Error).message);
  }
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "mandat-verify-"));
  const docker = deps.docker ?? realDockerRunner();
  let runIdForCleanup: string | null = null;
  try {
    const host = hostConfig(io.env);
    const dv = await dockerText(docker, ["version", "--format", "{{.Server.Version}}"]);
    if (dv.exitCode !== 0 || compareVersions(dv.stdout.trim(), "25.0.5") < 0) return envFail("E_DOCKER_VERSION", `docker ${dv.stdout.trim() || "unreachable"} < 25.0.5`);
    const images = deps.images ?? (await imageTags(deps.repoRoot ?? defaultRepoRoot));
    for (const t of [images.sandbox, images.gate]) {
      if ((await dockerText(docker, ["image", "inspect", t])).exitCode !== 0) return envFail("E_IMAGES_MISSING", `${t} missing; пусни pnpm mandat images build`);
    }
    const now = deps.verify?.now ?? (() => new Date());
    const runId = `r_${ulid(now().getTime())}`;
    runIdForCleanup = runId;
    await ensureUpstreamNetwork(docker).catch(() => undefined);
    const runDir = path.join(a.home, "runs", runId);
    const writer = new RunWriter(a.home, runDir, createRedactor({ exactSecrets: [] }), now);
    const progress = (l: string) => (a.json ? io.stderr(l + "\n") : io.stdout(l + "\n"));
    const vdeps: VerifyDeps = {
      docker, images, infraUser: deps.verify?.infraUser ?? (await infraUserFor(docker).catch(() => ({ user: "1000:1000" }))).user,
      ipv6Sysctl: deps.verify?.ipv6Sysctl ?? (await probeIpv6(docker, images.sandbox)), mandatHome: a.home, home: os.homedir(), mirrorPath: "",
      runId, runDir, tmpRoot, writer, ladderLevel: null, rulesetStrict: false, d7: "n/a", progress, now,
      ...(host.extraCa ? { extraCa: host.extraCa } : {}),
      ...(deps.verify?.runTests ? { runTests: deps.verify.runTests } : {}), ...(deps.verify?.startGate ? { startGate: deps.verify.startGate } : {}),
      ...(deps.verify?.recompute ? { recompute: deps.verify.recompute } : {}),
    };
    const mode = a.external ? ("external" as const) : ("full" as const);
    const reqBase = { mode, org_id: "o_local" as const, repo: { provider: "local" as const, full_name: null, path: a.repo }, task_type: a.type, agent: "external:mcp-local", level_cap: 1, requested_by: "cli" as const };
    const emptyDiff = `sha256:${"0".repeat(64)}`;
    const noPolicy: PolicyInput = { ok: false, reason: "missing", detail: "no trusted base" };
    // 1–2) trusted base
    const tb = await resolveTrustedBase({ repo: a.repo, remote: a.remote, home: a.home, tmpHome: tmpRoot });
    if (!tb.ok) {
      const out = await verifyChange({
        req: { ...reqBase, base_sha: ZERO, tree_sha: ZERO, diff_hash: emptyDiff }, policy: noPolicy, diffPatch: Buffer.alloc(0), files: [], deps: vdeps,
        preVerdict: ev("POLICY", "unknown", `base untrusted: ${tb.reason}`, { detail: tb.detail }, { cls: "base_untrusted", id: tb.reason }),
      });
      return report(out, { sha: ZERO, remote: null, branch: null });
    }
    vdeps.mirrorPath = tb.mirror;
    const yml = await readAtBase({ mirror: tb.mirror, baseSha: tb.baseSha, file: ".mandat.yml", tmpHome: tmpRoot });
    let policy: PolicyInput;
    if (yml === null) policy = { ok: false, reason: "missing", detail: ".mandat.yml" };
    else {
      const p = parseMandatYml(yml.toString("utf8"));
      policy = p.ok ? p : { ok: false, reason: "invalid", detail: p.error };
    }
    // 3) the agent's tree → clean export against the trusted base
    const files = await workingTreeFiles({ repo: a.repo, tmpHome: tmpRoot });
    const t = tarOf(a.repo, files);
    const limits = policy.ok ? policy.policy.security : { max_file_mb: 5, max_diff_mb: 20, max_files: 500 };
    const exp = await exportChangeset({ runId, mirrorPath: tb.mirror, baseSha: tb.baseSha, tar: t.stream, tarExit: t.exit, limits, tmpRoot });
    const base = { sha: tb.baseSha, remote: a.remote, branch: tb.branch };
    if (!exp.result.ok) {
      const first = exp.result.reasons[0];
      const out = await verifyChange({
        req: { ...reqBase, base_sha: tb.baseSha, tree_sha: ZERO, diff_hash: emptyDiff }, policy, diffPatch: Buffer.alloc(0), files: [], deps: vdeps,
        preVerdict: ev("EXPORT", "fail", `export refused: ${exp.result.reasons.map((r) => r.code).join(", ")}`, { reasons: exp.result.reasons }, { cls: first?.code ?? "-", id: first?.path ?? "-" }),
      });
      return report(out, base);
    }
    const ex = exp.result;
    const diffPatch = "diffPatch" in exp ? exp.diffPatch : Buffer.alloc(0);
    progress(`[export]    ${ex.files.length} file(s) changed · tree ${ex.tree_sha.slice(0, 7)} · base ${tb.baseSha.slice(0, 7)} (trusted ${tb.branch})`);
    await writer.text("export/changeset.json", ex);
    writer.raw("export/diff.patch", diffPatch);
    const out = await verifyChange({
      req: { ...reqBase, base_sha: tb.baseSha, tree_sha: ex.tree_sha, diff_hash: ex.diff_hash }, policy, diffPatch, files: ex.files as ChangedFile[], deps: vdeps, ...(a.hidden ? { hidden: readHidden(a.hidden) } : {}),
    });
    await writer.text("verdict.json", out.verdict);
    return report(out, base);
  } finally {
    if (runIdForCleanup) await cleanupRunResources(docker, runIdForCleanup);
    rmSync(tmpRoot, { recursive: true, force: true });
    release();
  }

  function report(out: VerifyOutcome, base: { sha: string; remote: string | null; branch: string | null }): number {
    const exit = exitFor(out.verdict.result);
    if (a.json) io.stdout(JSON.stringify({ ...out, exit }) + "\n");
    else io.stdout(formatOutcome(out, base));
    return exit;
  }
}

/** E0 т. 7.10: containers, networks and volumes of the run. */
export async function cleanupRunResources(docker: DockerRunner, runId: string): Promise<void> {
  const ps = await dockerText(docker, ["ps", "-aq", "--filter", `label=mandat.run=${runId}`]);
  for (const c of ps.stdout.split("\n").filter(Boolean)) await dockerText(docker, ["rm", "-f", c]);
  for (const t of ["agent", "base", "a", "b"] as const) {
    await dockerText(docker, ["network", "rm", names.net(runId, t)]);
    await dockerText(docker, ["volume", "rm", "-f", names.vol(runId, t)]);
  }
}
