import { createHash } from "node:crypto";

// E9f (v5 5.6, D-662): an in-memory GitLab REST v4 behind a `fetch`, for the GitLab port's tests. It models the rules the
// port relies on (docs.gitlab.com/api, read 26.11.2026): merge with `sha` ≠ head → 409; a draft, a closed MR or a red
// pipeline when „pipelines must succeed“ is on → 405; a branch that exists → 400; HEAD of a missing file → 404; commit
// statuses per (sha, name) where the latest wins. Anything it does not know → 404.

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

export interface FakeGitLabProject {
  default_branch: string;
  only_allow_merge_if_pipeline_succeeds: boolean;
  merge_method: "merge" | "rebase_merge" | "ff";
  /** Ultimate only: external status checks; absent → the endpoint answers 403 like a lower tier */
  external_status_checks?: { name: string }[];
}
export interface FakeGitLabMr {
  iid: number;
  title: string;
  description: string | null;
  source_branch: string;
  target_branch: string;
  sha: string;
  base_sha: string;
  draft: boolean;
  state: "opened" | "merged" | "closed";
  author: { id: number; username: string; bot: boolean };
  source_project_id: number;
  target_project_id: number;
  merge_commit_sha: string | null;
  squash_commit_sha: string | null;
  web_url: string;
}
export interface FakeGitLabState {
  projects: Map<string, FakeGitLabProject>;
  branches: Map<string, string>;
  commits: Map<string, { parent: string | null; files: Map<string, string>; message: string }>;
  mrs: Map<string, FakeGitLabMr>;
  statuses: { id: number; project: string; sha: string; name: string; status: string; description: string; target_url: string | null; author: { id: number } }[];
  pipelines: { id: number; project: string; sha: string; status: string }[];
  /** METHOD path (+ key params) of every request, for tests */
  calls: string[];
  /** the PRIVATE-TOKEN of every request */
  tokens: string[];
}

const json = (status: number, body: unknown) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function fakeGitLab(seed: { projects?: Record<string, Partial<FakeGitLabProject>> } = {}): { fetch: typeof fetch; state: FakeGitLabState; addPipeline(project: string, sha: string, status: string): void } {
  const st: FakeGitLabState = { projects: new Map(), branches: new Map(), commits: new Map(), mrs: new Map(), statuses: [], pipelines: [], calls: [], tokens: [] };
  let nextIid = 1;
  let nextId = 100;
  for (const [name, p] of Object.entries(seed.projects ?? {})) {
    const proj: FakeGitLabProject = { default_branch: "main", only_allow_merge_if_pipeline_succeeds: true, merge_method: "merge", ...p };
    st.projects.set(name, proj);
    const root = sha1(`${name}:root`);
    st.commits.set(root, { parent: null, files: new Map([["README.md", "# shop\n"]]), message: "root" });
    st.branches.set(`${name}:${proj.default_branch}`, root);
  }
  const mrView = (m: FakeGitLabMr) => ({ ...m, diff_refs: { base_sha: m.base_sha, head_sha: m.sha, start_sha: m.base_sha } });
  const pipelineOk = (project: string, sha: string): boolean => {
    const latest = new Map<string, string>();
    for (const s of st.statuses.filter((x) => x.project === project && x.sha === sha)) latest.set(s.name, s.status);
    const pipes = st.pipelines.filter((p) => p.project === project && p.sha === sha);
    if (latest.size === 0 && pipes.length === 0) return false;
    const last = pipes.at(-1);
    return [...latest.values()].every((v) => v === "success" || v === "skipped") && (!last || last.status === "success");
  };

  async function handle(method: string, url: URL, body: Record<string, unknown>): Promise<Response> {
    const m = /^\/api\/v4\/projects\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (!m) return json(404, { message: "404 Not Found" });
    const project = decodeURIComponent(m[1] ?? "");
    const rest = m[2] ?? "";
    const proj = st.projects.get(project);
    st.calls.push(`${method} ${rest || "/"}`);
    if (!proj) return json(404, { message: "404 Project Not Found" });
    const q = url.searchParams;
    let r: RegExpExecArray | null;
    if (method === "GET" && rest === "") return json(200, { id: 1, path_with_namespace: project, ...proj, external_status_checks: undefined });
    if (method === "GET" && rest === "/external_status_checks") return proj.external_status_checks ? json(200, proj.external_status_checks.map((c, i) => ({ id: i + 1, name: c.name, protected_branches: [] }))) : json(403, { message: "403 Forbidden" });
    if (method === "GET" && rest === "/merge_requests") return json(200, [...st.mrs.entries()].filter(([k, x]) => k.startsWith(`${project}!`) && (q.get("state") !== "opened" || x.state === "opened")).map(([, x]) => mrView(x)));
    if ((r = /^\/merge_requests\/(\d+)$/.exec(rest))) {
      const mr = st.mrs.get(`${project}!${r[1]}`);
      if (!mr) return json(404, { message: "404 Not found" });
      if (method === "GET") return json(200, mrView(mr));
      if (method === "PUT") {
        if (typeof body.title === "string") {
          mr.title = body.title;
          mr.draft = /^(\[draft\]|\(draft\)|draft:)/i.test(body.title);
        }
        return json(200, mrView(mr));
      }
    }
    if (method === "PUT" && (r = /^\/merge_requests\/(\d+)\/merge$/.exec(rest))) {
      const mr = st.mrs.get(`${project}!${r[1]}`);
      if (!mr) return json(404, { message: "404 Not found" });
      if (mr.state !== "opened" || mr.draft) return json(405, { message: "405 Method Not Allowed" });
      if (typeof body.sha === "string" && body.sha !== mr.sha) return json(409, { message: "SHA does not match HEAD of source branch" });
      if (proj.only_allow_merge_if_pipeline_succeeds && !pipelineOk(project, mr.sha)) return json(405, { message: "405 Method Not Allowed" });
      const target = st.branches.get(`${project}:${mr.target_branch}`) ?? "";
      const files = st.commits.get(mr.sha)?.files ?? new Map<string, string>();
      const merged = sha1(`merge:${target}:${mr.sha}`);
      st.commits.set(merged, { parent: target, files: new Map(files), message: `${mr.title} (!${mr.iid})` });
      st.branches.set(`${project}:${mr.target_branch}`, merged);
      mr.state = "merged";
      if (body.squash === true) mr.squash_commit_sha = merged;
      else mr.merge_commit_sha = merged;
      return json(200, mrView(mr));
    }
    if (method === "POST" && rest === "/merge_requests") {
      const src = String(body.source_branch ?? "");
      const head = st.branches.get(`${project}:${src}`);
      if (!head) return json(400, { message: ["Source branch does not exist"] });
      const title = String(body.title ?? "");
      const mr: FakeGitLabMr = {
        iid: nextIid++, title, description: (body.description as string | undefined) ?? null, source_branch: src, target_branch: String(body.target_branch ?? ""), sha: head,
        base_sha: st.branches.get(`${project}:${String(body.target_branch ?? "")}`) ?? "", draft: /^(\[draft\]|\(draft\)|draft:)/i.test(title), state: "opened",
        author: { id: 7001, username: "mandat-bot", bot: true }, source_project_id: 1, target_project_id: 1, merge_commit_sha: null, squash_commit_sha: null, web_url: `https://gitlab.invalid/${project}/-/merge_requests/0`,
      };
      mr.web_url = `https://gitlab.invalid/${project}/-/merge_requests/${mr.iid}`;
      st.mrs.set(`${project}!${mr.iid}`, mr);
      return json(201, mrView(mr));
    }
    if ((r = /^\/repository\/branches\/(.+)$/.exec(rest))) {
      const name = decodeURIComponent(r[1] ?? "");
      const sha = st.branches.get(`${project}:${name}`);
      if (method === "GET") return sha ? json(200, { name, commit: { id: sha } }) : json(404, { message: "404 Branch Not Found" });
      if (method === "DELETE") {
        if (!sha) return json(404, { message: "404 Branch Not Found" });
        if (name === proj.default_branch) return json(405, { message: "405 Method Not Allowed" });
        st.branches.delete(`${project}:${name}`);
        return json(204, null);
      }
    }
    if (method === "POST" && rest === "/repository/branches") {
      const name = String(body.branch ?? "");
      if (st.branches.has(`${project}:${name}`)) return json(400, { message: "Branch already exists" });
      const ref = String(body.ref ?? "");
      const sha = st.commits.has(ref) ? ref : st.branches.get(`${project}:${ref}`);
      if (!sha) return json(400, { message: "Invalid reference name" });
      st.branches.set(`${project}:${name}`, sha);
      return json(201, { name, commit: { id: sha } });
    }
    if (method === "HEAD" && (r = /^\/repository\/files\/(.+)$/.exec(rest))) {
      const file = decodeURIComponent(r[1] ?? "");
      const c = st.commits.get(q.get("ref") ?? "");
      return new Response(null, { status: c?.files.has(file) ? 200 : 404 });
    }
    if (method === "POST" && rest === "/repository/commits") {
      const branch = String(body.branch ?? "");
      const start = typeof body.start_sha === "string" ? body.start_sha : st.branches.get(`${project}:${branch}`);
      if (st.branches.has(`${project}:${branch}`) && body.force !== true && typeof body.start_sha === "string") return json(400, { message: "A branch called this already exists" });
      const parent = start ? st.commits.get(start) : undefined;
      if (!start || !parent) return json(400, { message: "start_sha is invalid" });
      const files = new Map(parent.files);
      for (const a of (body.actions as { action: string; file_path: string; content?: string; encoding?: string }[] | undefined) ?? []) {
        const has = files.has(a.file_path);
        if (a.action === "create" && has) return json(400, { message: `A file with this name already exists` });
        if ((a.action === "update" || a.action === "delete" || a.action === "chmod") && !has) return json(400, { message: `A file with this name doesn't exist` });
        if (a.action === "delete") files.delete(a.file_path);
        else if (a.action === "create" || a.action === "update") files.set(a.file_path, a.encoding === "base64" ? Buffer.from(a.content ?? "", "base64").toString("utf8") : (a.content ?? ""));
      }
      const id = sha1(`commit:${start}:${String(body.commit_message)}:${JSON.stringify([...files])}`);
      st.commits.set(id, { parent: start, files, message: String(body.commit_message ?? "") });
      st.branches.set(`${project}:${branch}`, id);
      return json(201, { id, parent_ids: [start], message: body.commit_message });
    }
    if (method === "POST" && (r = /^\/statuses\/([0-9a-f]{40})$/.exec(rest))) {
      const state = String(body.state ?? "");
      if (!["pending", "running", "success", "failed", "canceled", "skipped"].includes(state)) return json(400, { message: "state is invalid" });
      if (!st.commits.has(r[1] ?? "")) return json(404, { message: "404 Commit Not Found" });
      const s = { id: nextId++, project, sha: r[1] ?? "", name: String(body.name ?? "default"), status: state, description: String(body.description ?? "").slice(0, 255), target_url: (body.target_url as string | undefined) ?? null, author: { id: 7001 } };
      st.statuses.push(s);
      return json(201, s);
    }
    if (method === "GET" && (r = /^\/repository\/commits\/([0-9a-f]{40})\/statuses$/.exec(rest))) {
      const name = q.get("name");
      return json(200, st.statuses.filter((s) => s.project === project && s.sha === r?.[1] && (name === null || s.name === name)).reverse());
    }
    if (method === "GET" && rest === "/pipelines") return json(200, st.pipelines.filter((p) => p.project === project && p.sha === q.get("sha")).reverse().map(({ id, sha, status }) => ({ id, sha, status })));
    return json(404, { message: "404 Not Found" });
  }

  const f = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const headers = new Headers(init?.headers);
    st.tokens.push(headers.get("private-token") ?? "");
    const body = typeof init?.body === "string" && init.body !== "" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    return handle((init?.method ?? "GET").toUpperCase(), url, body);
  };
  return {
    fetch: f as typeof fetch,
    state: st,
    addPipeline: (project, sha, status) => void st.pipelines.push({ id: nextId++, project, sha, status }),
  };
}
