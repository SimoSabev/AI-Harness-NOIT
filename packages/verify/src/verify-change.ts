import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import type { D8Dependency } from "@mandat/core";
import path from "node:path";
import { Verdict, effectiveLevel, hashJcs, repoConfigFromPolicy, sha256Tag, taskTypeOf } from "@mandat/contract";
import type { ChangedFile, D7Status, ErrorCode, Evidence, MandatPolicy, RepoConfig, Sha256, VerifyOutcome, VerifyRequest } from "@mandat/contract";
import { buildReasons, decideVerdict, ev, na } from "@mandat/core";
import { cleanClone, recomputeTreeSha, removeTree } from "@mandat/export";
import type { DockerRunner } from "@mandat/sandbox";
import type { startRunGate } from "./gate.js";
import type { RunWriter } from "./run-dir.js";
import type { runTestProcedure } from "./test-procedure.js";
import { VerifyInfraError, verifyTrees } from "./verify-trees.js";
import type { HiddenTests } from "./verify-trees.js";

// Демо промпт т. 3.1 / 3.3 / 5.7 (D-205, D-206): the single verification contract.

/** Detectors that do not exist in this prompt; a policy that requires one → FAILED INFRA:detector_missing (т. 3.4). */
const MISSING_DETECTORS = ["D5", "D6", "D8"] as const;
export const EVIDENCE_ORDER = ["POLICY", "EXPORT", "INTEGRITY", "D10.lockfile", "D1.base_tests", "D2.inventory", "D3.protected", "D4.contract", "MUST_PASS", "D11.mutation", "CANARY", "D7.ci"] as const;

export interface VerifyDeps {
  docker: DockerRunner;
  images: { sandbox: string; gate: string; proxy: string };
  infraUser: string;
  extraCa?: string;
  ipv6Sysctl: boolean;
  mandatHome: string;
  home: string;
  /** Mandat's mirror that holds base_sha */
  mirrorPath: string;
  runId: string;
  runDir: string;
  tmpRoot: string;
  writer?: RunWriter;
  /** ladder level for the key; null = no ladder for this key (MCP/CLI, S39) */
  ladderLevel?: number | null;
  rulesetStrict?: boolean;
  d7?: D7Status;
  /** D7.ci lite evidence for head_sha (external PRs, т. 6.4); otherwise n/a */
  d7Evidence?: Evidence;
  startGate?: typeof startRunGate;
  runTests?: typeof runTestProcedure;
  /** v5 E9б (D8): license and age of new dependencies (default: the npm registry from the host) */
  depFacts?: (deps: { name: string; spec: string }[]) => Promise<D8Dependency[]>;
  recompute?: typeof recomputeTreeSha;
  progress?: (line: string) => void;
  now?: () => Date;
}

export type PolicyInput = { ok: true; policy: MandatPolicy; config_hash: Sha256 } | { ok: false; reason: "missing" | "invalid"; detail: string };

/** S27: earlier FAILED by D1/D2 for the same (base_sha, tree_sha, config_hash) caps a new verdict at UNKNOWN. */
export function historyFile(home: string): string {
  return path.join(home, "verify", "history.jsonl");
}
export function flakyHistory(home: string, key: { base_sha: string; tree_sha: string; config_hash: string }): string | null {
  const f = historyFile(home);
  if (!existsSync(f)) return null;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    if (!line) continue;
    try {
      const r = JSON.parse(line) as { base_sha: string; tree_sha: string; config_hash: string; result: string; first: string | null };
      if (r.base_sha === key.base_sha && r.tree_sha === key.tree_sha && r.config_hash === key.config_hash && r.result === "FAILED" && r.first) return r.first;
    } catch {
      // a torn last line is ignored
    }
  }
  return null;
}
function recordHistory(home: string, row: object): void {
  mkdirSync(path.dirname(historyFile(home)), { recursive: true });
  appendFileSync(historyFile(home), JSON.stringify(row) + "\n");
}

/** RepoConfig for the detectors: К-1 — the policy file itself is always protected config. */
function withPolicyProtected(rc: RepoConfig): RepoConfig {
  const add = (xs: string[]) => (xs.includes(".mandat.yml") ? xs : [...xs, ".mandat.yml"]);
  return { ...rc, protected_paths: add(rc.protected_paths), config_paths: add(rc.config_paths) };
}

export function syntheticTaskId(diffHash: string): string {
  return `t_ext_${diffHash.slice("sha256:".length, "sha256:".length + 12)}`;
}

export interface VerifyChangeInput {
  req: VerifyRequest;
  policy: PolicyInput;
  diffPatch: Buffer;
  files: ChangedFile[];
  deps: VerifyDeps;
  /** a verdict decided before verification (base untrusted, export refused): recorded as is */
  preVerdict?: Evidence;
  /** v5 E9б (D5): a person's hidden tests for tree B */
  hidden?: HiddenTests | null;
  /** v5 E9б (D8): lint and typecheck commands */
  checks?: { name: "lint" | "typecheck"; command: string }[];
}

export async function verifyChange(i: VerifyChangeInput): Promise<VerifyOutcome> {
  const { req, deps } = i;
  const t0 = Date.now();
  const now = deps.now ?? (() => new Date());
  const external = req.mode === "external";
  const evd = new Map<string, Evidence>();
  const set = (e: Evidence) => evd.set(e.detector, e);
  const aliases: string[] = [];
  let integrity: "ok" | "mismatch" | "n/a" = "n/a";
  const configHash: string = i.policy.ok ? i.policy.config_hash : "none";
  let riskCap = 1;
  const timings = { provision: 0, install: 0, agent: 0, export: 0, verify: 0, verdict: 0, total: 0 };
  set(na("CANARY", external ? "agent is not in our sandbox" : "not run"));
  set(deps.d7Evidence ?? na("D7.ci", "no CI signal"));

  const finish = (): VerifyOutcome => {
    const evidence = EVIDENCE_ORDER.map((d) => evd.get(d) ?? na(d));
    // D5 only when hidden tests ran (verdicts without them keep their evidence list)
    for (const d of ["D5.hidden", "D8.static"] as const) {
      const e = evd.get(d);
      if (e) evidence.push(e);
    }
    const infraEv = evd.get("INFRA");
    if (infraEv) evidence.push(infraEv);
    const result = decideVerdict(evidence);
    timings.total = Date.now() - t0;
    const verdict = Verdict.parse({
      run_id: deps.runId, task_id: syntheticTaskId(req.diff_hash), attempt: 1, mode: req.mode, agent: req.agent, result,
      reasons: buildReasons(evidence, aliases), evidence, contract_hash: hashJcs({ req, config_hash: configHash }), base_sha: req.base_sha,
      tree_sha: req.tree_sha, diff_hash: req.diff_hash, integrity, usage: { usd: 0, input_tokens: 0, output_tokens: 0, requests: 0 },
      timings_ms: timings, created_at: now().toISOString(),
    });
    const ladder = deps.ladderLevel ?? 3;
    const lvl = effectiveLevel({ ladder, riskCap, result, mode: req.mode, levelCap: req.level_cap, rulesetStrict: deps.rulesetStrict ?? false, d7: deps.d7 ?? "n/a" });
    let ledger: VerifyOutcome["ledger"] = null;
    if (deps.writer) {
      const red = deps.writer.r.redactJson(verdict).value as Verdict;
      deps.writer.ledger(external ? "external_verdict" : "verdict", verdict.task_id, {
        run_id: deps.runId, result: red.result, reasons: red.reasons, verdict_hash: hashJcs(red), effective_level: lvl.level, agent: req.agent,
      });
      if (deps.writer.ledgerFrom !== null && deps.writer.ledgerTo !== null) ledger = { from: deps.writer.ledgerFrom, to: deps.writer.ledgerTo };
    }
    const firstD12 = [...evidence].find((e) => (e.detector === "D1.base_tests" || e.detector === "D2.inventory") && e.status === "fail")?.signature ?? null;
    recordHistory(deps.mandatHome, { base_sha: req.base_sha, tree_sha: req.tree_sha, config_hash: configHash, result, first: firstD12, at: now().toISOString() });
    return {
      verdict, ladder_key: { repo: req.repo.full_name ?? req.repo.path ?? "-", task_type: req.task_type ?? "-", agent: req.agent },
      ladder_level: deps.ladderLevel ?? 0, effective_level: lvl.level, level_reasons: lvl.reasons, ledger,
    };
  };

  if (i.preVerdict) {
    set(i.preVerdict);
    return finish();
  }
  // 1) policy from the trusted base (К-1)
  if (!i.policy.ok) {
    set(ev("POLICY", "unknown", `policy ${i.policy.reason}: ${i.policy.detail}`, {}, { cls: i.policy.reason, id: ".mandat.yml" }));
    return finish();
  }
  const policy = i.policy.policy;
  const tt = req.task_type ? taskTypeOf(policy, req.task_type) : undefined;
  if (tt) riskCap = policy.risk_classes[tt.risk_class]?.level_cap ?? 1;
  const bridge = repoConfigFromPolicy(policy);
  if (!bridge.ok) {
    set(ev("POLICY", "pass", "policy loaded from base"));
    set(ev("INFRA", "unknown", `unsupported runner ${bridge.detail}`, {}, { cls: "unsupported_runner", id: bridge.detail }));
    return finish();
  }
  // D5 exists when a person gave hidden tests; without them a policy that requires D5 is FAILED INFRA:detector_missing
  const hasHidden = (i.hidden?.files.length ?? 0) > 0;
  const hasChecks = (i.checks?.length ?? 0) > 0;
  const missing = policy.harness.required_detectors.filter((d) => (MISSING_DETECTORS as readonly string[]).includes(d) && !(d === "D5" && hasHidden) && !(d === "D8" && hasChecks));
  if (missing.length > 0) {
    set(ev("POLICY", "pass", "policy loaded from base"));
    set(ev("INFRA", "fail", `required detector missing: ${missing.join(", ")}`, { missing }, { cls: "detector_missing", id: missing[0] ?? "-" }));
    return finish();
  }
  set(ev("POLICY", "pass", `policy loaded from base (${configHash.slice(7, 19)})`));
  const rc = withPolicyProtected(bridge.config);

  // 2) EXPORT: an empty change is never VERIFIED
  if (i.diffPatch.length === 0 || i.files.length === 0) {
    set(ev("EXPORT", "unknown", "empty change", {}, { cls: "empty_change", id: "-" }));
    return finish();
  }
  set(ev("EXPORT", "pass", `${i.files.length} file(s) changed`, { files: i.files.length }));
  // 3) INTEGRITY: tree_sha and diff_hash must match the diff
  const rc2 = await (deps.recompute ?? recomputeTreeSha)({ mirrorPath: deps.mirrorPath, baseSha: req.base_sha, diffPatch: i.diffPatch, tmpRoot: deps.tmpRoot });
  if ("treeSha" in rc2 && rc2.treeSha === req.tree_sha && sha256Tag(i.diffPatch) === req.diff_hash) {
    integrity = "ok";
    set(ev("INTEGRITY", "pass", "recomputed tree matches"));
  } else {
    integrity = "mismatch";
    set(ev("INTEGRITY", "unknown", "integrity mismatch", {}, { cls: "error" in rc2 ? "apply_failed" : "mismatch", id: "-" }));
    return finish();
  }
  // 4) trees and detectors (E0 sandbox, deny-all tests)
  const mayChangeTests = tt ? tt.may_change_tests : false; // F15: no type → false
  const t = Date.now();
  let baseDir: string | null = null;
  try {
    const base = await cleanClone({ mirrorPath: deps.mirrorPath, baseSha: req.base_sha, tmpRoot: deps.tmpRoot, name: "base" });
    baseDir = base.dir;
    const r = await verifyTrees({
      docker: deps.docker, runId: deps.runId, runDir: deps.runDir, mandatHome: deps.mandatHome, home: deps.home, images: deps.images,
      infraUser: deps.infraUser, ipv6Sysctl: deps.ipv6Sysctl, mirrorPath: deps.mirrorPath, baseSha: req.base_sha, baseDir, diffPatch: i.diffPatch,
      files: i.files, rc, allowedPaths: tt ? tt.allowed_paths : ["**"], mayChangeTests, mustPass: [], external, tmpRoot: deps.tmpRoot,
      ...(deps.extraCa ? { extraCa: deps.extraCa } : {}), ...(deps.startGate ? { startGate: deps.startGate } : {}), ...(deps.runTests ? { runTests: deps.runTests } : {}),
      ...(deps.progress ? { progress: deps.progress } : {}), ...(deps.depFacts ? { depFacts: deps.depFacts } : {}), ...(i.hidden ? { hidden: i.hidden } : {}), ...(i.checks ? { checks: i.checks } : {}),
    });
    for (const e of r.evidence) set(e);
    if (!tt) set(na("D4.contract", "no task type"));
  } catch (e) {
    if (!(e instanceof VerifyInfraError)) throw e;
    const code: ErrorCode = e.code;
    aliases.push(`infra:${code.replace(/^E_/, "").toLowerCase()}`);
    set(ev("INFRA", "unknown", `infra: ${code}`, {}, { cls: code.replace(/^E_/, ""), id: "-" }));
  } finally {
    if (baseDir) removeTree(baseDir);
    timings.verify = Date.now() - t;
  }
  // 5) S27: an earlier D1/D2 failure for the same key caps the result at UNKNOWN
  const flaky = flakyHistory(deps.mandatHome, { base_sha: req.base_sha, tree_sha: req.tree_sha, config_hash: configHash });
  const d1 = evd.get("D1.base_tests");
  if (flaky && d1 && d1.status === "pass") set(ev("D1.base_tests", "unknown", "earlier failure for the same tree", { first: flaky }, { cls: "flaky_history", id: flaky.split(":").slice(2).join(":") || "-" }));
  return finish();
}
