import { App } from "@octokit/app";
import { cleanGit } from "@mandat/export";
import type { CheckRunInput, GitHubPort, MergeResult, PullInfo, RulesInfo } from "./port.js";

// Демо промпт т. 6.1: the real adapter. Facts (checked 20.10.2026): only GitHub Apps create check runs (checks:write);
// PUT /pulls/{n}/merge with `sha` → 409 if the head moved, 405 if not mergeable; POST /git/refs → 422 if it exists.
// Used only by the worker with the Writer/Observer App keys from env (never by the coder; live tests run by Simo).

export interface FileChange {
  path: string;
  /** null = deleted */
  content: Buffer | null;
  mode: "100644" | "100755";
}

export interface OctokitOptions {
  appId: string;
  privateKey: string;
  installationId: number;
  /** turns a diff on top of parentSha into the changed files (the worker applies it in Mandat's mirror) */
  materialize?: (diff: Buffer, parentSha: string) => Promise<FileChange[]>;
  /** base URL for `git fetch` of refs/pull (tests: a local path) */
  cloneBase?: string;
  /** tests: a fake REST client instead of the App installation */
  rest?: Rest;
}

export type Rest = {
  request: (route: string, params?: Record<string, unknown>) => Promise<{ status: number; data: unknown }>;
};

const split = (repo: string) => {
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error(`bad repo ${repo}`);
  return { owner, repo: name };
};

function toPull(d: Record<string, unknown>): PullInfo {
  const head = d.head as Record<string, unknown>;
  const base = d.base as Record<string, unknown>;
  const user = d.user as Record<string, unknown>;
  const performed = (d.performed_via_github_app ?? null) as Record<string, unknown> | null;
  return {
    number: d.number as number, head_sha: head.sha as string, head_ref: head.ref as string, base_ref: base.ref as string, base_sha: base.sha as string,
    author_login: user.login as string, author_id: user.id as number, author_type: user.type === "Bot" ? "Bot" : "User", author_app_id: (performed?.id as number | undefined) ?? null,
    author_association: d.author_association as string, draft: Boolean(d.draft), head_repo_full_name: ((head.repo as Record<string, unknown> | null)?.full_name as string | undefined) ?? "",
    title: d.title as string, body: (d.body as string | null) ?? null,
  };
}

export function octokitGitHub(o: OctokitOptions): GitHubPort {
  let kit: Promise<Rest> | null = o.rest ? Promise.resolve(o.rest) : null;
  const rest = () => (kit ??= new App({ appId: o.appId, privateKey: o.privateKey }).getInstallationOctokit(o.installationId) as unknown as Promise<Rest>);
  const req = async (route: string, params: Record<string, unknown> = {}) => (await rest()).request(route, params);
  const status = (e: unknown) => (e as { status?: number }).status ?? 0;
  return {
    async getPull(repo, n) {
      return toPull((await req("GET /repos/{owner}/{repo}/pulls/{pull_number}", { ...split(repo), pull_number: n })).data as Record<string, unknown>);
    },
    async listOpenPulls(repo) {
      const r = await req("GET /repos/{owner}/{repo}/pulls", { ...split(repo), state: "open", per_page: 50 });
      return (r.data as Record<string, unknown>[]).map(toPull);
    },
    async getRules(repo, branch): Promise<RulesInfo> {
      const r = await req("GET /repos/{owner}/{repo}/rules/branches/{branch}", { ...split(repo), branch });
      const rules = r.data as { type: string; parameters?: Record<string, unknown> }[];
      const rsc = rules.find((x) => x.type === "required_status_checks")?.parameters as { strict_required_status_checks_policy?: boolean; required_status_checks?: { context: string; integration_id?: number }[] } | undefined;
      const ids: Record<string, number> = {};
      for (const c of rsc?.required_status_checks ?? []) if (c.integration_id !== undefined) ids[c.context] = c.integration_id;
      return { strict: Boolean(rsc?.strict_required_status_checks_policy), requiredContexts: (rsc?.required_status_checks ?? []).map((c) => c.context), mergeQueue: rules.some((x) => x.type === "merge_queue"), integrationIds: ids };
    },
    async createOrUpdateCheckRun(repo, i: CheckRunInput) {
      const existing = await req("GET /repos/{owner}/{repo}/commits/{ref}/check-runs", { ...split(repo), ref: i.head_sha, check_name: i.name, per_page: 100 });
      const runs = (existing.data as { check_runs: { id: number; external_id: string | null }[] }).check_runs;
      const found = runs.find((c) => c.external_id === i.external_id);
      const body = { name: i.name, head_sha: i.head_sha, external_id: i.external_id, status: "completed", conclusion: i.conclusion, output: { title: i.title, summary: i.summary }, ...(i.details_url ? { details_url: i.details_url } : {}) };
      if (found) {
        await req("PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}", { ...split(repo), check_run_id: found.id, ...body });
        return { id: found.id, created: false };
      }
      const r = await req("POST /repos/{owner}/{repo}/check-runs", { ...split(repo), ...body });
      return { id: (r.data as { id: number }).id, created: true };
    },
    async createRefIfAbsent(repo, i) {
      try {
        await req("POST /repos/{owner}/{repo}/git/refs", { ...split(repo), ref: i.ref, sha: i.sha });
        return { ok: true };
      } catch (e) {
        if (status(e) === 422) return { ok: false, reason: "ref_exists" };
        throw e;
      }
    },
    async createCommit(repo, i) {
      if (!o.materialize) throw new Error("createCommit needs materialize()");
      const files = await o.materialize(i.treeFromDiff, i.parentSha);
      const parent = (await req("GET /repos/{owner}/{repo}/git/commits/{commit_sha}", { ...split(repo), commit_sha: i.parentSha })).data as { tree: { sha: string } };
      const tree: Record<string, unknown>[] = [];
      for (const f of files) {
        if (f.content === null) tree.push({ path: f.path, mode: f.mode, type: "blob", sha: null });
        else {
          const b = await req("POST /repos/{owner}/{repo}/git/blobs", { ...split(repo), content: f.content.toString("base64"), encoding: "base64" });
          tree.push({ path: f.path, mode: f.mode, type: "blob", sha: (b.data as { sha: string }).sha });
        }
      }
      const t = await req("POST /repos/{owner}/{repo}/git/trees", { ...split(repo), base_tree: parent.tree.sha, tree });
      const treeSha = (t.data as { sha: string }).sha;
      const c = await req("POST /repos/{owner}/{repo}/git/commits", { ...split(repo), message: i.message, tree: treeSha, parents: [i.parentSha] });
      return { commitSha: (c.data as { sha: string }).sha, treeSha };
    },
    async createPull(repo, i) {
      const r = await req("POST /repos/{owner}/{repo}/pulls", { ...split(repo), ...i });
      const d = r.data as { number: number; html_url: string };
      return { number: d.number, url: d.html_url };
    },
    async markReadyForReview(repo, n) {
      const pull = (await req("GET /repos/{owner}/{repo}/pulls/{pull_number}", { ...split(repo), pull_number: n })).data as { node_id: string };
      await req("POST /graphql", { query: "mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { clientMutationId } }", variables: { id: pull.node_id } });
    },
    async mergePull(repo, n, i): Promise<MergeResult> {
      try {
        const r = await req("PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge", { ...split(repo), pull_number: n, sha: i.sha, merge_method: i.merge_method });
        return { ok: true, merge_commit_sha: (r.data as { sha: string }).sha };
      } catch (e) {
        const s = status(e);
        if (s === 405 || s === 409 || s === 422 || s === 403 || s === 404) return { ok: false, status: s, message: (e as Error).message.slice(0, 300) };
        throw e;
      }
    },
    async getCommitTreeSha(repo, sha) {
      return ((await req("GET /repos/{owner}/{repo}/git/commits/{commit_sha}", { ...split(repo), commit_sha: sha })).data as { tree: { sha: string } }).tree.sha;
    },
    async listCheckRunsForRef(repo, sha) {
      const r = await req("GET /repos/{owner}/{repo}/commits/{ref}/check-runs", { ...split(repo), ref: sha, per_page: 100 });
      return (r.data as { check_runs: { name: string; status: string; conclusion: string | null; app: { id: number; slug: string } | null }[] }).check_runs.map((c) => ({ name: c.name, status: c.status, conclusion: c.conclusion, app_id: c.app?.id ?? 0, app_slug: c.app?.slug ?? "" }));
    },
    async listCommitStatusesForRef(repo, sha) {
      const r = await req("GET /repos/{owner}/{repo}/commits/{ref}/statuses", { ...split(repo), ref: sha, per_page: 100 });
      return (r.data as { context: string; state: "error" | "failure" | "pending" | "success"; creator: { id: number } | null }[]).map((s) => ({ context: s.context, state: s.state, creator_id: s.creator?.id ?? 0 }));
    },
    async fetchPullHead(repo, n, mirrorPath) {
      // S14: only refs/pull/<n>/head of the BASE repo (public clone URL), never the fork's URL or ref.
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !Number.isInteger(n) || n < 1) throw new Error("bad repo/pull");
      const git = cleanGit({ tmpHome: mirrorPath });
      const f = await git.run(["-c", "core.fsync=objects,reference", "fetch", "-q", "--no-tags", "--end-of-options", `${o.cloneBase ?? "https://github.com"}/${repo}.git`, `+refs/pull/${n}/head:refs/mandat/pr/${n}`], { cwd: mirrorPath });
      if (f.code !== 0) throw new Error(`fetch refs/pull/${n}/head failed: ${f.stderr.slice(0, 200)}`);
      const h = await git.run(["rev-parse", "--verify", "--end-of-options", `refs/mandat/pr/${n}`], { cwd: mirrorPath });
      return { head_sha: h.stdout.toString("utf8").trim() };
    },
  };
}
