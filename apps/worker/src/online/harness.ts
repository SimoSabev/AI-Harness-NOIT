import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanGit } from "@mandat/export";
import type { GitHubPort } from "@mandat/gate-github";
import { appendLedgerOnline } from "@mandat/ledger";
import { dirView, filesPatch, lineDiff, propose, proposeProfile, scanRepo } from "@mandat/onboard";
import type { Baseline } from "@mandat/onboard";
import type { MandatPolicy } from "@mandat/contract";
import type { Db } from "./db.js";
import { inTransaction } from "./db.js";
import { drainOutbox } from "./outbox.js";
import type { EffectHandler } from "./outbox.js";
import { PgOutbox } from "./pg-outbox.js";
import { webPushHandler } from "./push.js";
import { approvalHandlers } from "./effects.js";
import { mcpHandlers } from "./mcp.js";
import type { McpVetRunner } from "./mcp.js";

// Демо промпт т. 8.2 Поток 1 (стъпки 1–4, 6, 9; стъпка 5 LLM е забранена): connect → scan a clean clone (hooks off)
// → proposal + field_sources + ledger config_change/proposed; after the owner's TOTP approval (web, private.approve_harness)
// → the outbox delivers a draft PR with .mandat.yml + AGENTS.md + CLAUDE.md through the Writer port.
export interface HarnessDeps {
  db: Db;
  gh: GitHubPort;
  ghRepo: string;
  tmpRoot?: string;
  /** E7г (D-314): runs the base tests twice in the sandbox; absent (no Docker) → the baseline step is skipped */
  baselineRunner?: (treeDir: string, policy: MandatPolicy) => Promise<Baseline>;
  /** E8e (D-354): runs an MCP server once without network and vets its definitions; absent → mcp_vet stays pending */
  mcpVetRunner?: McpVetRunner;
}

export interface Existing { ".mandat.yml": string | null; "AGENTS.md": string | null; "CLAUDE.md": string | null }

export async function scanForProposal(d: HarnessDeps, repoId: string): Promise<string> {
  const r = (await d.db.query<{ org_id: string; remote_url: string; default_branch: string }>("select org_id::text as org_id, remote_url, default_branch from public.repos where id = $1::uuid", [repoId])).rows[0];
  if (!r) throw new Error("unknown repo");
  const tmp = mkdtempSync(path.join(d.tmpRoot ?? os.tmpdir(), "mandat-scan-"));
  try {
    const git = cleanGit({ tmpHome: tmp });
    const clone = path.join(tmp, "clone");
    if (!/^[A-Za-z0-9._/-]{1,200}$/.test(r.default_branch)) throw new Error("bad default branch");
    // E8б: 50 commits of history → the commit conventions of the profile (layer B)
    const c = await git.run(["clone", "-q", "--no-tags", "--depth", "50", "--branch", r.default_branch, "--end-of-options", r.remote_url, clone], { cwd: tmp });
    if (c.code !== 0) throw new Error(`clone failed: ${c.stderr.slice(0, 200)}`);
    const head = (await git.run(["rev-parse", "HEAD"], { cwd: clone })).stdout.toString("utf8").trim();
    const view = dirView(clone);
    const scan = scanRepo(view);
    const rules = await d.gh.getRules(d.ghRepo, r.default_branch).catch(() => null);
    const p = propose(scan, { rulesStrict: rules ? rules.strict : null });
    const subjects = (await git.run(["log", "-n", "50", "--format=%s"], { cwd: clone })).stdout.toString("utf8").split("\n").filter(Boolean);
    const stats = (await git.run(["log", "-n", "50", "--shortstat", "--format=tformat:@"], { cwd: clone })).stdout.toString("utf8");
    const diffLines = stats.split("@").map((b) => [...b.matchAll(/(\d+) (?:insertion|deletion)/g)].reduce((n, m) => n + Number(m[1]), 0)).filter((n) => n > 0);
    const clean = (f: string) => (scan.instructions.find((i) => i.path === f)?.invisible.length ? null : view.read(f));
    const existing: Existing = { ".mandat.yml": view.read(".mandat.yml"), "AGENTS.md": clean("AGENTS.md"), "CLAUDE.md": clean("CLAUDE.md") };
    const links = ["README.md", "CONTRIBUTING.md"].filter((f) => view.files.includes(f));
    const summary = {
      package_manager: scan.packageManager, framework: scan.framework, node: scan.node, workflows: scan.workflows, docker: scan.docker, monorepo: scan.monorepo,
      dangerous_dirs: scan.dangerousDirs, secret_files: scan.secretFiles, instructions: scan.instructions.map((i) => ({ path: i.path, invisible: i.invisible.length, patterns: i.patterns })),
      folder_tree: scan.folderTree.slice(0, 200), scripts: scan.scripts, rules, existing, links,
    };
    return await inTransaction(d.db, async (tx) => {
      const ins = await tx.query<{ id: string }>(
        `insert into public.harness_proposals (org_id, repo_id, status, policy_yaml, base_commit, yaml_sha256, field_sources, scan, risk_cap, blocked, needs_human, warnings)
         values ($1::uuid, $2::uuid, 'proposed', $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::jsonb, $10::jsonb, $11::jsonb) returning id::text as id`,
        [r.org_id, repoId, p.yaml, head, p.sha256, JSON.stringify(p.field_sources), JSON.stringify(summary), p.risk_cap, JSON.stringify(p.blocked), JSON.stringify(p.needs_human), JSON.stringify(p.warnings)],
      );
      const id = ins.rows[0]?.id as string;
      // E8б (D-351): the full profile as a new proposed version (approved only by a human with TOTP)
      const next = (await tx.query<{ v: number }>("select coalesce(max(version), 0) + 1 as v from public.harness_profiles where repo_id = $1::uuid", [repoId])).rows[0]?.v ?? 1;
      const prof = proposeProfile(scan, { repoId, version: next, history: { subjects, diffLines } }).profile;
      await tx.query("insert into public.harness_profiles (org_id, repo_id, version, layers, sources, profile_hash) values ($1::uuid, $2::uuid, $3, $4::jsonb, $5::jsonb, $6)", [r.org_id, repoId, next, JSON.stringify(prof.layers), JSON.stringify(prof.sources), prof.profile_hash]);
      const diff = lineDiff(existing[".mandat.yml"] ?? "", p.yaml);
      await appendLedgerOnline(tx, { org_id: r.org_id, kind: "config_change", task_id: null, payload: { proposal_id: id, status: "proposed", yaml_sha256: p.sha256, base_commit: head, added: diff.filter((l) => l.startsWith("+")).length, removed: diff.filter((l) => l.startsWith("-")).length } });
      // E7г (D-314, Q-026 reversed): the baseline runs asynchronously; the proposal is usable before it ends
      await tx.query("insert into public.outbox (org_id, kind, idempotency_key, payload) values ($1::uuid, 'baseline', $2, $3::jsonb) on conflict do nothing", [r.org_id, `baseline:${id}`, JSON.stringify({ proposal_id: id })]);
      return id;
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** E7г: clone base, run the baseline twice, re-propose with it (flaky IDs, 0 tests → risk cap 1) while still proposed. */
export async function baselineForProposal(d: HarnessDeps, proposalId: string): Promise<Baseline | null> {
  if (!d.baselineRunner) return null;
  const r = (await d.db.query<{ org_id: string; remote_url: string; base_commit: string; status: string; scan: Record<string, unknown> }>(
    "select hp.org_id::text as org_id, r.remote_url, hp.base_commit, hp.status, hp.scan from public.harness_proposals hp join public.repos r on r.id = hp.repo_id where hp.id = $1::uuid",
    [proposalId],
  )).rows[0];
  if (!r || r.status !== "proposed" || !/^[0-9a-f]{40}$/.test(r.base_commit)) return null;
  const tmp = mkdtempSync(path.join(d.tmpRoot ?? os.tmpdir(), "mandat-baseline-"));
  try {
    const git = cleanGit({ tmpHome: tmp });
    const clone = path.join(tmp, "clone");
    const c = await git.run(["clone", "-q", "--no-tags", "--end-of-options", r.remote_url, clone], { cwd: tmp });
    if (c.code !== 0) throw new Error(`clone failed: ${c.stderr.slice(0, 200)}`);
    if ((await git.run(["checkout", "-q", "--detach", r.base_commit], { cwd: clone })).code !== 0) throw new Error("base commit missing");
    const scan = scanRepo(dirView(clone));
    const first = propose(scan);
    const baseline = await d.baselineRunner(clone, first.policy);
    const p = propose(scan, { baseline });
    await inTransaction(d.db, async (tx) => {
      const u = await tx.query<{ id: string }>(
        `update public.harness_proposals set policy_yaml = $2, yaml_sha256 = $3, field_sources = $4::jsonb, risk_cap = $5, warnings = $6::jsonb, needs_human = $7::jsonb, scan = scan || jsonb_build_object('baseline', $8::jsonb, 'suggested_tasks', $9::jsonb)
         where id = $1::uuid and status = 'proposed' returning id::text as id`,
        [proposalId, p.yaml, p.sha256, JSON.stringify(p.field_sources), p.risk_cap, JSON.stringify(p.warnings), JSON.stringify(p.needs_human), JSON.stringify(baseline), JSON.stringify(p.suggested_tasks)],
      );
      if (u.rows.length > 0) await appendLedgerOnline(tx, { org_id: r.org_id, kind: "config_change", task_id: null, payload: { proposal_id: proposalId, status: "baseline", yaml_sha256: p.sha256, baseline } });
    });
    return baseline;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

interface GeneratedFile { path: string; sha256: string; content: string; before: string | null }

export async function deliverHarnessPr(d: HarnessDeps, proposalId: string): Promise<{ number: number } | null> {
  const hp = (await d.db.query<{ org_id: string; status: string; base_commit: string; version: number; generated: GeneratedFile[]; pr_number: number | null; yaml_sha256: string; default_branch: string }>(
    "select h.org_id::text as org_id, h.status, h.base_commit, h.version, h.generated, h.pr_number, h.yaml_sha256, r.default_branch from public.harness_proposals h join public.repos r on r.id = h.repo_id where h.id = $1::uuid",
    [proposalId],
  )).rows[0];
  if (!hp || hp.status !== "approved") throw new Error("proposal is not approved");
  if (hp.pr_number !== null) return { number: hp.pr_number }; // idempotent
  const patch = filesPatch(hp.generated.map((f) => ({ path: f.path, before: f.before, after: f.content })));
  const c = await d.gh.createCommit(d.ghRepo, { treeFromDiff: Buffer.from(patch, "utf8"), parentSha: hp.base_commit, message: `mandat: harness v${hp.version} (${hp.yaml_sha256.slice(7, 15)})` });
  const ref = `mandat/harness-${proposalId}`;
  const created = await d.gh.createRefIfAbsent(d.ghRepo, { ref: `refs/heads/${ref}`, sha: c.commitSha });
  if (!created.ok) throw new Error("harness branch already exists (changed by a human?)");
  const body = [`Mandat harness v${hp.version} from .mandat.yml@${hp.yaml_sha256.slice(0, 15)}…`, "", ...hp.generated.map((f) => `- \`${f.path}\` ${f.sha256.slice(0, 15)}…`), "", "Approved by the owner with a fresh TOTP code. A human merges this PR."].join("\n");
  const pr = await d.gh.createPull(d.ghRepo, { head: ref, base: hp.default_branch, title: `Mandat harness v${hp.version}`, body, draft: true });
  const ext = `harness:${proposalId}`;
  await d.gh.createOrUpdateCheckRun(d.ghRepo, { name: "Мандат harness", head_sha: c.commitSha, external_id: ext, conclusion: "success", title: `harness v${hp.version}`, summary: "Generated by template from the approved .mandat.yml (no LLM)." });
  await d.gh.createOrUpdateCheckRun(d.ghRepo, { name: "Мандат approval", head_sha: c.commitSha, external_id: ext, conclusion: "success", title: "approved (owner + TOTP)", summary: "The harness proposal was approved by an owner with a fresh second factor." });
  await d.gh.createOrUpdateCheckRun(d.ghRepo, { name: "Мандат verdict", head_sha: c.commitSha, external_id: ext, conclusion: "skipped", title: "harness PR: no agent change", summary: "This PR carries no agent change; the protection is the approval check." });
  await inTransaction(d.db, async (tx) => {
    await tx.query("update public.harness_proposals set pr_number = $2 where id = $1::uuid", [proposalId, pr.number]);
    await appendLedgerOnline(tx, { org_id: hp.org_id, kind: "delivered", task_id: null, payload: { proposal_id: proposalId, kind: "draft_pr", pr: pr.number, head_sha: c.commitSha } });
  });
  return { number: pr.number };
}

export function harnessHandlers(d: HarnessDeps): { harness_scan: EffectHandler; harness_pr: EffectHandler; baseline: EffectHandler } {
  return {
    baseline: async (row) => {
      const id = String(row.payload.proposal_id ?? "");
      if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("baseline without proposal_id");
      await baselineForProposal(d, id);
    },
    harness_scan: async (row) => {
      const repo = String(row.payload.repo_id ?? "");
      if (!/^[0-9a-f-]{36}$/.test(repo)) throw new Error("harness_scan without repo_id");
      await scanForProposal(d, repo);
    },
    harness_pr: async (row) => {
      const id = String(row.payload.proposal_id ?? "");
      if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("harness_pr without proposal_id");
      await deliverHarnessPr(d, id);
    },
  };
}

/** One drain of the worker's effects (harness + web push) on a dedicated connection (T3-2: SKIP LOCKED; other kinds stay pending). */
export async function drainHarnessOutbox(d: HarnessDeps & { env?: Record<string, string | undefined>; log?: (l: string) => void }): Promise<{ done: number; failed: number; skipped: number }> {
  const c = await d.db.connect();
  try {
    return await drainOutbox(new PgOutbox(c), { ...harnessHandlers(d), ...approvalHandlers(d), ...(d.mcpVetRunner ? mcpHandlers({ db: d.db, vetRunner: d.mcpVetRunner }) : {}), web_push: webPushHandler({ db: d.db, ...(d.env ? { env: d.env } : {}), ...(d.log ? { log: d.log } : {}) }) });
  } finally {
    c.release();
  }
}
