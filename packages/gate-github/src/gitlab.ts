import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CLEAN_GIT_CONFIG, cleanGitEnv } from "@mandat/export";
import type { FileChange } from "./octokit.js";
import { CHECK_NAMES } from "./port.js";
import type { CheckRunInput, GitHubPort, MergeResult, PullInfo, RulesInfo } from "./port.js";

// E9f (v5 5.6, D-331, D-662): the GitLab port — the same GitHubPort over GitLab REST v4, so the gate's delivery code
// (deliver, autoMerge, humanApproved, CI rounds) runs unchanged. Facts from docs.gitlab.com/api (read 26.11.2026, links in
// docs/decisions.md D-662); what the docs do not say is [НП] until the live test (gitlab.live.test.ts) runs:
//   pull request  = merge request (iid); head = `sha`, base = `diff_refs.base_sha`; draft = the „Draft:“ title prefix [НП]
//   check run     = commit status (POST /projects/:id/statuses/:sha; states pending|running|success|failed|canceled|skipped);
//                   GitLab has no action_required → `failed` with the „UNKNOWN: …“ title (D-209's fallback)
//   approval      = the „Мандат approval“ status (MR approval rules are Premium; Mandat's approval is its own)
//   CI            = pipelines for the sha (GET /projects/:id/pipelines?sha=) + the other commit statuses
//   required      = „Pipelines must succeed“ → Mandat's two statuses must be green [НП: external statuses count in the
//                   pipeline]; Ultimate's external status checks are added by name
//   merge         = PUT …/merge with `sha` (409 when the head moved, 405 when it cannot merge, 401 no permission)
//   commit        = POST /repository/commits on a temporary branch from `start_sha`, then the real branch from that sha
//                   and the temporary one is deleted (GitLab has no dangling commits through the API)
//   tree sha      = not in the commits API → `git fetch` of the sha (or the `treeOf` option)
// The token goes only in the PRIVATE-TOKEN header (and, for git, in an env header); never into an error or a log.

export interface GitLabOptions {
  /** https://gitlab.com or a self-managed instance */
  baseUrl: string;
  token: string;
  /** turns a diff on top of parentSha into the changed files (the worker applies it in Mandat's mirror) */
  materialize?: (diff: Buffer, parentSha: string) => Promise<FileChange[]>;
  /** base URL for `git fetch` (tests: a local path); default = baseUrl */
  cloneBase?: string;
  /** tests: the fake's fetch */
  fetch?: typeof fetch;
  /** the tree sha of a commit; default: `git fetch` of that sha */
  treeOf?: (project: string, sha: string) => Promise<string>;
}

const PROJECT = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+){1,20}$/;
const pid = (project: string): string => {
  if (!PROJECT.test(project) || project.split("/").some((p) => p === "." || p === "..")) throw new Error("bad project path");
  return encodeURIComponent(project);
};
const DRAFT = /^\s*(\[draft\]|\(draft\)|draft:)\s*/i;

type Http = { status: number; data: unknown };
class GitLabError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function toPull(project: string, d: Record<string, unknown>): PullInfo {
  const author = (d.author ?? {}) as { id?: number; username?: string; bot?: boolean };
  const refs = (d.diff_refs ?? {}) as { base_sha?: string };
  return {
    number: d.iid as number, head_sha: d.sha as string, head_ref: d.source_branch as string, base_ref: d.target_branch as string, base_sha: refs.base_sha ?? "",
    author_login: author.username ?? "", author_id: author.id ?? 0, author_type: author.bot === true ? "Bot" : "User", author_app_id: null,
    // GitLab has no author_association; NONE keeps every external-MR rule on its strictest branch
    author_association: "NONE", draft: d.draft === true, head_repo_full_name: d.source_project_id === d.target_project_id ? project : `gitlab-project:${String(d.source_project_id)}`,
    title: String(d.title ?? ""), body: (d.description as string | null | undefined) ?? null,
  };
}

const STATE: Record<CheckRunInput["conclusion"], string> = { success: "success", failure: "failed", action_required: "failed", skipped: "skipped" };

export function gitlabPort(o: GitLabOptions): GitHubPort {
  const f = o.fetch ?? fetch;
  const api = `${o.baseUrl.replace(/\/+$/, "")}/api/v4`;
  const tmpBranches = new Map<string, string>(); // commit sha → its temporary branch
  async function req(method: string, p: string, body?: Record<string, unknown>): Promise<Http> {
    const r = await f(`${api}${p}`, {
      method,
      headers: { "PRIVATE-TOKEN": o.token, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    const text = method === "HEAD" ? "" : await r.text();
    const data: unknown = text === "" ? null : (() => {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    })();
    if (r.status >= 400) throw new GitLabError(r.status, `GitLab ${method} ${p.replace(/\?.*$/, "")} → ${r.status}`);
    return { status: r.status, data };
  }
  const statusOf = (e: unknown) => (e instanceof GitLabError ? e.status : 0);

  /** git with the token in an env-only header (git ≥ 2.31 GIT_CONFIG_COUNT; never on the command line) [НП: git over HTTPS with a token as oauth2 basic auth]. */
  function git(args: string[], cwd: string, home: string): Promise<{ code: number; stdout: string }> {
    const auth = Buffer.from(`oauth2:${o.token}`).toString("base64");
    const env = { ...cleanGitEnv(home), GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.extraHeader", GIT_CONFIG_VALUE_0: `Authorization: Basic ${auth}` };
    return new Promise((resolve, reject) => {
      const c = spawn("git", [...CLEAN_GIT_CONFIG.flatMap((x) => ["-c", x]), ...args], { cwd, env, stdio: ["ignore", "pipe", "ignore"] });
      const out: Buffer[] = [];
      c.stdout.on("data", (b: Buffer) => out.push(b));
      c.on("error", reject);
      c.on("close", (code) => resolve({ code: code ?? 1, stdout: Buffer.concat(out).toString("utf8").trim() }));
    });
  }
  const cloneUrl = (project: string) => `${(o.cloneBase ?? o.baseUrl).replace(/\/+$/, "")}/${project}.git`;

  async function existingStatus(project: string, sha: string, name: string): Promise<{ id: number; status: string; description: string } | null> {
    const r = await req("GET", `/projects/${pid(project)}/repository/commits/${sha}/statuses?name=${encodeURIComponent(name)}&per_page=100`);
    const list = (r.data as { id: number; name: string; status: string; description: string | null }[]).filter((s) => s.name === name);
    const latest = list.sort((a, b) => b.id - a.id)[0];
    return latest ? { id: latest.id, status: latest.status, description: latest.description ?? "" } : null;
  }

  return {
    async getPull(project, n) {
      return toPull(project, (await req("GET", `/projects/${pid(project)}/merge_requests/${n}`)).data as Record<string, unknown>);
    },
    async listOpenPulls(project) {
      const r = await req("GET", `/projects/${pid(project)}/merge_requests?state=opened&per_page=50`);
      return (r.data as Record<string, unknown>[]).map((d) => toPull(project, d));
    },
    async getRules(project): Promise<RulesInfo> {
      const p = (await req("GET", `/projects/${pid(project)}`)).data as { only_allow_merge_if_pipeline_succeeds?: boolean; merge_method?: string; merge_trains_enabled?: boolean };
      const external = await req("GET", `/projects/${pid(project)}/external_status_checks`).then((r) => (r.data as { name: string }[]).map((c) => c.name)).catch(() => [] as string[]);
      const required = [...(p.only_allow_merge_if_pipeline_succeeds ? CHECK_NAMES.filter((c) => c !== "Мандат harness") : []), ...external];
      return { strict: p.merge_method === "ff" || p.merge_method === "rebase_merge", requiredContexts: required, mergeQueue: p.merge_trains_enabled === true, integrationIds: {} };
    },
    async createOrUpdateCheckRun(project, i) {
      const state = STATE[i.conclusion];
      const description = i.title.slice(0, 255);
      const found = await existingStatus(project, i.head_sha, i.name);
      // the same state twice is not posted again (GitLab refuses a transition to the same state [НП])
      if (found && found.status === state && found.description === description) return { id: found.id, created: false };
      const r = await req("POST", `/projects/${pid(project)}/statuses/${i.head_sha}`, { state, name: i.name, description, ...(i.details_url ? { target_url: i.details_url.slice(0, 255) } : {}) });
      return { id: found?.id ?? (r.data as { id: number }).id, created: found === null };
    },
    async createRefIfAbsent(project, i) {
      const branch = i.ref.replace(/^refs\/heads\//, "");
      const exists = await req("GET", `/projects/${pid(project)}/repository/branches/${encodeURIComponent(branch)}`).then(() => true).catch((e: unknown) => {
        if (statusOf(e) === 404) return false;
        throw e;
      });
      if (exists) return { ok: false, reason: "ref_exists" };
      try {
        await req("POST", `/projects/${pid(project)}/repository/branches`, { branch, ref: i.sha });
      } catch (e) {
        if (statusOf(e) === 400) return { ok: false, reason: "ref_exists" }; // a race: it appeared meanwhile
        throw e;
      }
      const tmp = tmpBranches.get(i.sha);
      if (tmp) {
        await req("DELETE", `/projects/${pid(project)}/repository/branches/${encodeURIComponent(tmp)}`).catch(() => undefined);
        tmpBranches.delete(i.sha);
      }
      return { ok: true };
    },
    async createCommit(project, i) {
      if (!o.materialize) throw new Error("createCommit needs materialize()");
      const files = await o.materialize(i.treeFromDiff, i.parentSha);
      const actions: Record<string, unknown>[] = [];
      for (const fc of files) {
        const has = await req("HEAD", `/projects/${pid(project)}/repository/files/${encodeURIComponent(fc.path)}?ref=${i.parentSha}`).then(() => true).catch((e: unknown) => {
          if (statusOf(e) === 404) return false;
          throw e;
        });
        if (fc.content === null) {
          if (has) actions.push({ action: "delete", file_path: fc.path });
          continue;
        }
        actions.push({ action: has ? "update" : "create", file_path: fc.path, content: fc.content.toString("base64"), encoding: "base64" });
        if (fc.mode === "100755") actions.push({ action: "chmod", file_path: fc.path, execute_filemode: true });
      }
      const tmp = `mandat/tmp-${createHash("sha256").update(i.parentSha).update(i.treeFromDiff).update(i.message).digest("hex").slice(0, 16)}`;
      const r = await req("POST", `/projects/${pid(project)}/repository/commits`, { branch: tmp, start_sha: i.parentSha, force: true, commit_message: i.message, actions });
      const commitSha = (r.data as { id: string }).id;
      tmpBranches.set(commitSha, tmp);
      return { commitSha, treeSha: o.treeOf ? await o.treeOf(project, commitSha) : "" };
    },
    async createPull(project, i) {
      const r = await req("POST", `/projects/${pid(project)}/merge_requests`, { source_branch: i.head, target_branch: i.base, title: i.draft ? `Draft: ${i.title}` : i.title, description: i.body, squash: true, remove_source_branch: false });
      const d = r.data as { iid: number; web_url: string };
      return { number: d.iid, url: d.web_url };
    },
    async markReadyForReview(project, n) {
      const mr = (await req("GET", `/projects/${pid(project)}/merge_requests/${n}`)).data as { title: string };
      if (DRAFT.test(mr.title)) await req("PUT", `/projects/${pid(project)}/merge_requests/${n}`, { title: mr.title.replace(DRAFT, "") });
    },
    async mergePull(project, n, i): Promise<MergeResult> {
      try {
        const r = await req("PUT", `/projects/${pid(project)}/merge_requests/${n}/merge`, { sha: i.sha, squash: i.merge_method === "squash" });
        const d = r.data as { merge_commit_sha?: string | null; squash_commit_sha?: string | null; sha?: string };
        return { ok: true, merge_commit_sha: d.merge_commit_sha ?? d.squash_commit_sha ?? d.sha ?? i.sha };
      } catch (e) {
        const s = statusOf(e);
        if (s === 409 || s === 405 || s === 404 || s === 422) return { ok: false, status: s, message: (e as Error).message.slice(0, 300) };
        if (s === 401 || s === 403) return { ok: false, status: 403, message: (e as Error).message.slice(0, 300) };
        if (s === 406) return { ok: false, status: 405, message: (e as Error).message.slice(0, 300) };
        throw e;
      }
    },
    async getCommitTreeSha(project, sha) {
      if (o.treeOf) return o.treeOf(project, sha);
      if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("bad sha");
      pid(project);
      const home = mkdtempSync(path.join(os.tmpdir(), "mandat-gl-tree-"));
      try {
        if ((await git(["init", "-q", "--bare", home], home, home)).code !== 0) throw new Error("git init failed");
        if ((await git(["fetch", "-q", "--no-tags", "--depth=1", "--end-of-options", cloneUrl(project), sha], home, home)).code !== 0) throw new Error(`fetch of ${sha.slice(0, 12)} failed`);
        return (await git(["rev-parse", "--verify", "--end-of-options", `${sha}^{tree}`], home, home)).stdout;
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    },
    async listCheckRunsForRef(project, sha) {
      const r = await req("GET", `/projects/${pid(project)}/pipelines?sha=${sha}&per_page=100`);
      return (r.data as { id: number; status: string }[]).map((p) => {
        const done = ["success", "failed", "canceled", "skipped"].includes(p.status);
        const conclusion = p.status === "success" ? "success" : p.status === "failed" ? "failure" : p.status === "canceled" ? "cancelled" : p.status === "skipped" ? "skipped" : p.status === "manual" ? "action_required" : null;
        return { name: `pipeline #${p.id}`, status: done ? "completed" : p.status === "running" ? "in_progress" : "queued", conclusion, app_id: 0, app_slug: "gitlab-ci" };
      });
    },
    async listCommitStatusesForRef(project, sha) {
      const r = await req("GET", `/projects/${pid(project)}/repository/commits/${sha}/statuses?per_page=100`);
      return (r.data as { name: string; status: string; author: { id: number } | null }[]).map((s) => ({
        context: s.name,
        state: s.status === "success" || s.status === "skipped" ? ("success" as const) : s.status === "failed" ? ("failure" as const) : s.status === "canceled" ? ("error" as const) : ("pending" as const),
        creator_id: s.author?.id ?? 0,
      }));
    },
    async fetchPullHead(project, n, mirrorPath) {
      // only the target project's refs/merge-requests/<iid>/head [НП: the ref is documented only as a pipeline ref], never the fork's URL
      if (!Number.isInteger(n) || n < 1) throw new Error("bad merge request");
      pid(project);
      const f2 = await git(["-c", "core.fsync=objects,reference", "fetch", "-q", "--no-tags", "--end-of-options", cloneUrl(project), `+refs/merge-requests/${n}/head:refs/mandat/pr/${n}`], mirrorPath, mirrorPath);
      if (f2.code !== 0) throw new Error(`fetch refs/merge-requests/${n}/head failed`);
      return { head_sha: (await git(["rev-parse", "--verify", "--end-of-options", `refs/mandat/pr/${n}`], mirrorPath, mirrorPath)).stdout };
    },
  };
}
