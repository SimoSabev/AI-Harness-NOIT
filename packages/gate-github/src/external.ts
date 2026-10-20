import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseMandatYml, ulid } from "@mandat/contract";
import type { ChangedFile, VerifyOutcome } from "@mandat/contract";
import { d7ci, ev } from "@mandat/core";
import { CLEAN_GIT_CONFIG, cleanGit, cleanGitEnv, exportChangeset } from "@mandat/export";
import { RunWriter, pinTrustedRemote, readAtBase, verifyChange } from "@mandat/verify";
import type { PolicyInput, VerifyDeps } from "@mandat/verify";
import { createRedactor } from "@mandat/redaction";
import { externalId, intakeDecision, originOf } from "./intake.js";
import type { KnownHead, QueueState } from "./intake.js";
import type { CheckRunInput, GitHubPort } from "./port.js";
import { renderCheck } from "./render.js";

// Демо промпт т. 6.4 (път 1, В-3; D-206, D-207, D-237): the external verdict for a PR Mandat did not open.
// Mandat never merges, never marks ready and never pushes for such a PR: it posts „Мандат verdict“ only.

export interface ExternalPrInput {
  gh: GitHubPort;
  repo: string;
  number: number;
  /** clone URL of the BASE repo as pinned by a human (repos.remote_url) — never the fork */
  remoteUrl: string;
  defaultBranch: string;
  writerAppId: number;
  ownAppIds: number[];
  known: KnownHead[];
  queue: QueueState;
  approvedByHuman?: boolean;
  verify: Omit<VerifyDeps, "mirrorPath" | "runId" | "runDir" | "tmpRoot" | "ladderLevel" | "d7" | "d7Evidence" | "writer">;
  appUrl?: string | null;
  /** in the worker this is an outbox row (T3-2) */
  postCheck: (repo: string, c: CheckRunInput) => Promise<void>;
  security?: (kind: "branch_namespace_spoof", detail: Record<string, string>) => void;
  now?: () => Date;
}

export type ExternalPrResult =
  | { kind: "ours" }
  | { kind: "check_only"; reason: string; check: CheckRunInput }
  | { kind: "retry"; reason: "head_moved" }
  | { kind: "verdict"; outcome: VerifyOutcome; check: CheckRunInput };

function gitArchive(mirror: string, sha: string, tmpHome: string): { stream: NodeJS.ReadableStream; exit: Promise<{ code: number; stderr: string }> } {
  const prefix = CLEAN_GIT_CONFIG.flatMap((f) => ["-c", f]);
  const child = spawn("git", [...prefix, "archive", "--format=tar", sha], { cwd: mirror, env: cleanGitEnv(tmpHome), stdio: ["ignore", "pipe", "pipe"] }); // T3-7: sha (regex-checked)
  let stderr = "";
  child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
  const exit = new Promise<{ code: number; stderr: string }>((resolve) => child.on("close", (code) => resolve({ code: code ?? 1, stderr })));
  return { stream: child.stdout, exit };
}

export async function externalPrVerdict(i: ExternalPrInput): Promise<ExternalPrResult> {
  const now = i.now ?? (() => new Date());
  const pull = await i.gh.getPull(i.repo, i.number);
  if (!/^[0-9a-f]{40}$/.test(pull.head_sha) || !/^[0-9a-f]{40}$/.test(pull.base_sha)) throw new Error("bad sha from GitHub");
  const o = originOf(pull, { writerAppId: i.writerAppId, known: i.known });
  if (o.origin === "mandat") return { kind: "ours" };
  if (o.spoof) i.security?.("branch_namespace_spoof", { repo: i.repo, pull: String(i.number), head_ref: pull.head_ref.slice(0, 100) });
  const extId = externalId(i.repo, i.number, pull.head_sha);
  const checkOnly = async (reason: string, title: string): Promise<ExternalPrResult> => {
    const check: CheckRunInput = { name: "Мандат verdict", head_sha: pull.head_sha, external_id: extId, conclusion: "action_required", title, summary: `${title}\n\nMandat did not run a verification for this head.` };
    await i.postCheck(i.repo, check);
    return { kind: "check_only", reason, check };
  };
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "mandat-ext-"));
  try {
    // 1) the trusted default branch in Mandat's own mirror (S1)
    const pin = await pinTrustedRemote({ remote: i.remoteUrl, home: i.verify.mandatHome, tmpHome: tmpRoot });
    if (!pin.ok) return await checkOnly("base_untrusted", `UNKNOWN: POLICY:base_untrusted:${pin.reason}`);
    // 2) intake: external_agents come from the default branch, never from the PR (К-1)
    const tipYml = await readAtBase({ mirror: pin.mirror, baseSha: pin.tip, file: ".mandat.yml", tmpHome: tmpRoot });
    const tipPolicy = tipYml ? parseMandatYml(tipYml.toString("utf8")) : null;
    const externalAgents = tipPolicy?.ok ? (tipPolicy.policy.security.external_agents ?? []) : [];
    const d = intakeDecision(pull, { defaultBranch: i.defaultBranch, externalAgents, approvedByHuman: i.approvedByHuman ?? false, queue: i.queue });
    if (d.kind === "check_only") return await checkOnly(d.reason, d.title);
    // 3) head only from the base repo's refs/pull/<n>/head (S14)
    const head = await i.gh.fetchPullHead(i.repo, i.number, pin.mirror);
    if (head.head_sha !== pull.head_sha) return { kind: "retry", reason: "head_moved" };
    const git = cleanGit({ tmpHome: tmpRoot });
    const runId = `r_${ulid(now().getTime())}`;
    const runDir = path.join(i.verify.mandatHome, "runs", runId);
    const writer = new RunWriter(i.verify.mandatHome, runDir, createRedactor({ exactSecrets: [] }), now);
    const reqBase = {
      mode: "external" as const, org_id: "o_local" as const, repo: { provider: "github" as const, full_name: i.repo, path: null }, base_sha: pull.base_sha,
      task_type: null, agent: `external:gh:${pull.author_id}`, level_cap: 1, requested_by: "github_observer" as const,
    };
    // 4) D7.ci lite for head_sha (S24): never blocks; FAILED from D2 wins over a green CI
    const d7 = d7ci({ checkRuns: await i.gh.listCheckRunsForRef(i.repo, pull.head_sha), statuses: await i.gh.listCommitStatusesForRef(i.repo, pull.head_sha), ownAppIds: i.ownAppIds });
    const deps: VerifyDeps = { ...i.verify, mirrorPath: pin.mirror, runId, runDir, tmpRoot, writer, ladderLevel: null, rulesetStrict: false, d7: d7.status, d7Evidence: d7.evidence };
    const ZERO = "0".repeat(40);
    const empty = `sha256:${"0".repeat(64)}`;
    const post = async (outcome: VerifyOutcome): Promise<ExternalPrResult> => {
      const r = renderCheck(outcome.verdict, { effectiveLevel: outcome.effective_level, levelReasons: outcome.level_reasons, mode: "external", ledgerSeq: outcome.ledger?.to ?? null, appUrl: i.appUrl ?? null, taskId: outcome.verdict.task_id });
      const check: CheckRunInput = { name: "Мандат verdict", head_sha: pull.head_sha, external_id: extId, conclusion: r.conclusion, title: r.title, summary: r.summary, ...(r.details_url ? { details_url: r.details_url } : {}) };
      await i.postCheck(i.repo, check);
      return { kind: "verdict", outcome, check };
    };
    // 5) base_sha must be an ancestor of the trusted tip; otherwise UNKNOWN
    const anc = await git.run(["merge-base", "--is-ancestor", "--end-of-options", pull.base_sha, `refs/mandat/trusted/${pin.branch}`], { cwd: pin.mirror });
    const noPolicy: PolicyInput = { ok: false, reason: "missing", detail: "no trusted base" };
    if (anc.code !== 0) {
      return post(await verifyChange({ req: { ...reqBase, tree_sha: ZERO, diff_hash: empty }, policy: noPolicy, diffPatch: Buffer.alloc(0), files: [], deps, preVerdict: ev("POLICY", "unknown", "PR base is not on the protected branch", {}, { cls: "base_untrusted", id: "not_ancestor" }) }));
    }
    await git.run(["-c", "core.fsync=objects,reference", "update-ref", "refs/heads/mandat/base", pull.base_sha], { cwd: pin.mirror }); // T3-7: sha (regex-checked)
    // 6) policy from base_sha (К-1)
    const yml = await readAtBase({ mirror: pin.mirror, baseSha: pull.base_sha, file: ".mandat.yml", tmpHome: tmpRoot });
    let policy: PolicyInput;
    if (yml === null) policy = { ok: false, reason: "missing", detail: ".mandat.yml" };
    else {
      const p = parseMandatYml(yml.toString("utf8"));
      policy = p.ok ? p : { ok: false, reason: "invalid", detail: p.error };
    }
    // 7) the PR head tree through the safe export of E0
    const t = gitArchive(pin.mirror, pull.head_sha, tmpRoot);
    const limits = policy.ok ? policy.policy.security : { max_file_mb: 5, max_diff_mb: 20, max_files: 500 };
    const exp = await exportChangeset({ runId, mirrorPath: pin.mirror, baseSha: pull.base_sha, tar: t.stream, tarExit: t.exit, limits, tmpRoot });
    if (!exp.result.ok) {
      const first = exp.result.reasons[0];
      return post(await verifyChange({ req: { ...reqBase, tree_sha: ZERO, diff_hash: empty }, policy, diffPatch: Buffer.alloc(0), files: [], deps, preVerdict: ev("EXPORT", "fail", "export refused", { reasons: exp.result.reasons }, { cls: first?.code ?? "-", id: first?.path ?? "-" }) }));
    }
    const diffPatch = "diffPatch" in exp ? exp.diffPatch : Buffer.alloc(0);
    return post(await verifyChange({ req: { ...reqBase, tree_sha: exp.result.tree_sha, diff_hash: exp.result.diff_hash }, policy, diffPatch, files: exp.result.files as ChangedFile[], deps }));
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
}
