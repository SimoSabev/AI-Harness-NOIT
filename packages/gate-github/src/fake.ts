import { createHash } from "node:crypto";
import { cleanGit } from "@mandat/export";
import type { CheckRunInput, GitHubPort, MergeResult, PullInfo, RulesInfo } from "./port.js";

// Демо промпт т. 6.1: deterministic in-memory GitHub that ENFORCES the ruleset (F3): merge → 405 unless every required
// context has a check run with conclusion ∈ {success, skipped, neutral} for head_sha from the pinned integration;
// 409 when sha ≠ head; createRefIfAbsent → 422 (ref_exists) when the ref exists. PATCH of refs is not modelled.

export const WRITER_APP_ID = 1001;
export const OBSERVER_APP_ID = 1002;
const GREEN = new Set(["success", "skipped", "neutral"]);
const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

export interface FakeRepo {
  default_branch: string;
  /** sha of the default branch head */
  head: string;
  rules: RulesInfo;
  /** a local bare git repo that holds refs/pull/<n>/head (for fetchPullHead) */
  gitPath?: string;
}
export interface FakeCheck {
  id: number;
  name: string;
  head_sha: string;
  external_id: string;
  conclusion: string;
  app_id: number;
  title: string;
  summary: string;
  details_url?: string;
}
export interface FakeGitHubState {
  repos: Map<string, FakeRepo>;
  pulls: Map<string, PullInfo & { merged: boolean; merge_commit_sha: string | null }>;
  refs: Map<string, string>;
  /** diff = the patch the commit was made from (tests read the delivered files) */
  commits: Map<string, { tree: string; parent: string | null; diff?: string }>;
  checks: FakeCheck[];
  statuses: { repo: string; sha: string; context: string; state: "error" | "failure" | "pending" | "success"; creator_id: number }[];
  /** every call, for tests (method + key args) */
  calls: string[];
}
export interface FakeSeed {
  repos?: Record<string, Partial<FakeRepo>>;
  pulls?: { repo: string; pull: Partial<PullInfo> & { number: number; head_sha: string } }[];
  /** app id the fake acts as for check runs (Writer by default) */
  actingAppId?: number;
}

const DEFAULT_RULES: RulesInfo = { strict: true, requiredContexts: ["Мандат verdict", "Мандат approval"], mergeQueue: false, integrationIds: { "Мандат verdict": WRITER_APP_ID, "Мандат approval": WRITER_APP_ID } };

export function fakeGitHub(seed: FakeSeed = {}): GitHubPort & { state: FakeGitHubState; humanMerge(repo: string, n: number): Promise<MergeResult>; addCheck(repo: string, c: Omit<FakeCheck, "id">): void; pushToPull(repo: string, n: number, sha: string): void } {
  const st: FakeGitHubState = { repos: new Map(), pulls: new Map(), refs: new Map(), commits: new Map(), checks: [], statuses: [], calls: [] };
  const acting = seed.actingAppId ?? WRITER_APP_ID;
  for (const [name, r] of Object.entries(seed.repos ?? {})) {
    const head = r.head ?? sha1(`${name}:root`);
    st.repos.set(name, { default_branch: r.default_branch ?? "main", head, rules: r.rules ?? DEFAULT_RULES, ...(r.gitPath ? { gitPath: r.gitPath } : {}) });
    st.commits.set(head, { tree: sha1(`tree:${head}`), parent: null });
    st.refs.set(`${name}:refs/heads/${r.default_branch ?? "main"}`, head);
  }
  let nextPull = 1;
  for (const p of seed.pulls ?? []) {
    const repo = st.repos.get(p.repo);
    st.pulls.set(`${p.repo}#${p.pull.number}`, {
      head_ref: `feature/${p.pull.number}`, base_ref: repo?.default_branch ?? "main", base_sha: repo?.head ?? "", author_login: "octo-agent", author_id: 4242, author_type: "User",
      author_app_id: null, author_association: "COLLABORATOR", draft: false, head_repo_full_name: p.repo, title: "", body: null, merged: false, merge_commit_sha: null, ...p.pull,
    });
    nextPull = Math.max(nextPull, p.pull.number + 1);
  }
  let nextCheck = 1;
  const repoOf = (repo: string) => {
    const r = st.repos.get(repo);
    if (!r) throw Object.assign(new Error(`404 repo ${repo}`), { status: 404 });
    return r;
  };
  const pullOf = (repo: string, n: number) => {
    const p = st.pulls.get(`${repo}#${n}`);
    if (!p) throw Object.assign(new Error(`404 pull ${repo}#${n}`), { status: 404 });
    return p;
  };
  const rulesOk = (repo: string, sha: string): string | null => {
    const r = repoOf(repo).rules;
    for (const ctx of r.requiredContexts) {
      const want = r.integrationIds?.[ctx];
      const latest = [...st.checks].reverse().find((c) => c.name === ctx && c.head_sha === sha && (want === undefined || c.app_id === want));
      if (!latest || !GREEN.has(latest.conclusion)) return `Required status check "${ctx}" is expected.`;
    }
    return null;
  };
  const doMerge = (repo: string, n: number): MergeResult => {
    const p = pullOf(repo, n);
    if (p.merged) return { ok: false, status: 405, message: "Pull Request is not mergeable (already merged)" };
    if (p.draft) return { ok: false, status: 405, message: "Pull Request is still a draft" };
    const why = rulesOk(repo, p.head_sha);
    if (why) return { ok: false, status: 405, message: `Repository rule violations found\n\n${why}` };
    const r = repoOf(repo);
    const tree = st.commits.get(p.head_sha)?.tree ?? sha1(`tree:${p.head_sha}`);
    const merge = sha1(`merge:${r.head}:${p.head_sha}`);
    st.commits.set(merge, { tree, parent: r.head });
    r.head = merge;
    st.refs.set(`${repo}:refs/heads/${r.default_branch}`, merge);
    p.merged = true;
    p.merge_commit_sha = merge;
    return { ok: true, merge_commit_sha: merge };
  };

  return {
    state: st,
    getPull: (repo, n) => {
      st.calls.push(`getPull ${repo}#${n}`);
      const { merged: _m, merge_commit_sha: _c, ...p } = pullOf(repo, n);
      return Promise.resolve({ ...p });
    },
    listOpenPulls: (repo) => {
      st.calls.push(`listOpenPulls ${repo}`);
      return Promise.resolve([...st.pulls.entries()].filter(([k, p]) => k.startsWith(`${repo}#`) && !p.merged).map(([, p]) => {
        const { merged: _m, merge_commit_sha: _c, ...rest } = p;
        return rest;
      }));
    },
    getRules: (repo) => Promise.resolve({ ...repoOf(repo).rules }),
    createOrUpdateCheckRun: (repo, i: CheckRunInput) => {
      st.calls.push(`check ${repo} ${i.name} ${i.head_sha.slice(0, 7)} ${i.conclusion}`);
      repoOf(repo);
      const found = st.checks.find((c) => c.external_id === i.external_id && c.name === i.name && c.head_sha === i.head_sha && c.app_id === acting);
      if (found) {
        Object.assign(found, { conclusion: i.conclusion, title: i.title, summary: i.summary, ...(i.details_url ? { details_url: i.details_url } : {}) });
        return Promise.resolve({ id: found.id, created: false });
      }
      const c: FakeCheck = { id: nextCheck++, name: i.name, head_sha: i.head_sha, external_id: i.external_id, conclusion: i.conclusion, app_id: acting, title: i.title, summary: i.summary, ...(i.details_url ? { details_url: i.details_url } : {}) };
      st.checks.push(c);
      return Promise.resolve({ id: c.id, created: true });
    },
    createRefIfAbsent: (repo, i) => {
      st.calls.push(`createRef ${repo} ${i.ref}`);
      const k = `${repo}:${i.ref}`;
      if (st.refs.has(k)) return Promise.resolve({ ok: false, reason: "ref_exists" });
      st.refs.set(k, i.sha);
      return Promise.resolve({ ok: true });
    },
    createCommit: (repo, i) => {
      repoOf(repo);
      const tree = sha1(`tree:${st.commits.get(i.parentSha)?.tree ?? i.parentSha}:${createHash("sha1").update(i.treeFromDiff).digest("hex")}`);
      const commitSha = sha1(`commit:${i.parentSha}:${tree}:${i.message}`);
      st.commits.set(commitSha, { tree, parent: i.parentSha, diff: i.treeFromDiff.toString("utf8") });
      return Promise.resolve({ commitSha, treeSha: tree });
    },
    createPull: (repo, i) => {
      st.calls.push(`createPull ${repo} ${i.head} draft=${i.draft}`);
      const r = repoOf(repo);
      const head = st.refs.get(`${repo}:refs/heads/${i.head}`);
      if (!head) return Promise.reject(Object.assign(new Error("422 head ref missing"), { status: 422 }));
      const n = nextPull++;
      st.pulls.set(`${repo}#${n}`, {
        number: n, head_sha: head, head_ref: i.head, base_ref: i.base, base_sha: r.head, author_login: "mandat-writer[bot]", author_id: 900001, author_type: "Bot", author_app_id: acting,
        author_association: "NONE", draft: i.draft, head_repo_full_name: repo, title: i.title, body: i.body, merged: false, merge_commit_sha: null,
      });
      return Promise.resolve({ number: n, url: `https://github.invalid/${repo}/pull/${n}` });
    },
    markReadyForReview: (repo, n) => {
      st.calls.push(`ready ${repo}#${n}`);
      pullOf(repo, n).draft = false;
      return Promise.resolve();
    },
    mergePull: (repo, n, i) => {
      st.calls.push(`merge ${repo}#${n} ${i.sha.slice(0, 7)}`);
      const p = pullOf(repo, n);
      if (p.head_sha !== i.sha) return Promise.resolve({ ok: false, status: 409, message: "Head branch was modified. Review and try the merge again." });
      return Promise.resolve(doMerge(repo, n));
    },
    getCommitTreeSha: (_repo, sha) => {
      const c = st.commits.get(sha);
      return c ? Promise.resolve(c.tree) : Promise.reject(Object.assign(new Error("404 commit"), { status: 404 }));
    },
    listCheckRunsForRef: (repo, sha) =>
      Promise.resolve(st.checks.filter((c) => c.head_sha === sha).map((c) => ({ name: c.name, status: "completed", conclusion: c.conclusion, app_id: c.app_id, app_slug: c.app_id === WRITER_APP_ID ? "mandat-writer" : "ci" })).concat(repo ? [] : [])),
    listCommitStatusesForRef: (repo, sha) => Promise.resolve(st.statuses.filter((s) => s.repo === repo && s.sha === sha).map(({ context, state, creator_id }) => ({ context, state, creator_id }))),
    fetchPullHead: async (repo, n, mirrorPath) => {
      st.calls.push(`fetchPullHead ${repo}#${n}`);
      const r = repoOf(repo);
      const p = pullOf(repo, n);
      if (!r.gitPath) return { head_sha: p.head_sha };
      // S14: only the base repo's refs/pull/<n>/head, never the fork
      const git = cleanGit({ tmpHome: mirrorPath });
      const f = await git.run(["-c", "core.fsync=objects,reference", "fetch", "-q", "--no-tags", "--end-of-options", r.gitPath, `+refs/pull/${n}/head:refs/mandat/pr/${n}`], { cwd: mirrorPath });
      if (f.code !== 0) throw new Error(`fetch refs/pull/${n}/head failed: ${f.stderr.slice(0, 200)}`);
      const h = await git.run(["rev-parse", "--verify", "--end-of-options", `refs/mandat/pr/${n}`], { cwd: mirrorPath });
      return { head_sha: h.stdout.toString("utf8").trim() };
    },
    humanMerge: (repo, n) => {
      st.calls.push(`humanMerge ${repo}#${n}`);
      return Promise.resolve(doMerge(repo, n));
    },
    addCheck: (repo, c) => {
      repoOf(repo);
      st.checks.push({ ...c, id: nextCheck++ });
    },
    pushToPull: (repo, n, sha) => {
      const p = pullOf(repo, n);
      p.head_sha = sha;
      st.commits.set(sha, { tree: sha1(`tree:${sha}`), parent: p.base_sha });
      st.refs.set(`${repo}:refs/heads/${p.head_ref}`, sha);
    },
  };
}
