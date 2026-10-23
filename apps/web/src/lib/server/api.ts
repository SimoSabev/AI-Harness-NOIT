import { ApproveBody, CreateTaskBody, FailureLabelBody, applyComments, approve, createTask, fixCiTask, labelFailure, retryTask, stopTask } from "./actions";
import type { Result, SecondFactor } from "./actions";
import { checkCsrf, checkOrigin, readJsonBody } from "./guard";
import type { RateLimiter } from "./guard";
import { SwitchBody, listChannels, switchChannel } from "./channels";
import { SubscribeBody, subscribePush } from "./push";
import { HarnessApproveBody, approveHarness, connectRepo } from "./harness";
import { KeysBody } from "./keys";
import type { KeysClient } from "./keys";
import { board, changesetShot, inbox, membership, taskDetail } from "./queries";
import { createRole, hasCap, listRoles, setMemberRole, updateRole } from "./roles";
import { ProfileApproveBody, ProfileRollbackBody, approveProfile, rollbackProfile } from "./profile";
import { steerTask } from "./steer";
import { taskFeed } from "./chat-feed";
import type { TaskFeed } from "./chat-feed";
import { answerQuestion, closeQuestion, planNight } from "./night";
import { uploadHidden } from "./hidden";
import { ApproveMcpBody, addMcpServer, approveMcpServer } from "./mcp";
import { listRegistry } from "@mandat/mcp-bridge/registry";
import { AskDecisionBody, PermissionBody, decideAsk, setPermission } from "./permissions";
import type { Db } from "./sql";
import { UUID } from "./sql";
import type { ColumnNo } from "../board";

// Demo prompt §8.1: the internal API as plain functions (Request → Response); app/api/**/route.ts only wires deps.
export interface ApiDeps {
  db: Db;
  /** the signed-in user's id, or null */
  user: (req: Request) => Promise<string | null>;
  secondFactor: SecondFactor;
  broadcast?: (topic: string, event: string, payload: Record<string, unknown>) => Promise<void>;
  createLimiter: RateLimiter;
  /** D-293: the control endpoint of `mandat local` (absent elsewhere) */
  keys?: KeysClient;
}

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function ctx(req: Request, d: ApiDeps): Promise<{ uid: string; org: string; role: "owner" | "approver" | "viewer" } | Response> {
  const uid = await d.user(req);
  if (!uid) return json(401, { error: "not_signed_in" });
  const m = await membership(d.db, uid);
  if (!m) return json(403, { error: "no_org" });
  return { uid, org: m.org_id, role: m.role };
}

async function post(req: Request, d: ApiDeps): Promise<{ uid: string; org: string; body: unknown } | Response> {
  if (!checkOrigin(req)) return json(403, { error: "bad_origin" });
  if (!checkCsrf(req)) return json(403, { error: "bad_csrf" });
  const c = await ctx(req, d);
  if (c instanceof Response) return c;
  const b = await readJsonBody(req);
  if (!b.ok) return json(b.status, { error: b.status === 413 ? "body_too_large" : "bad_json" });
  return { uid: c.uid, org: c.org, body: b.value };
}

async function done(r: Result, d: ApiDeps): Promise<Response> {
  if (r.broadcast && d.broadcast) {
    const payload = { task_id: r.broadcast.task, ...r.body };
    await d.broadcast(`org:${r.broadcast.org}:board`, "task", payload).catch(() => undefined);
    await d.broadcast(`task:${r.broadcast.task}`, "task", payload).catch(() => undefined);
  }
  return json(r.status, r.body);
}

export async function getInbox(req: Request, d: ApiDeps): Promise<Response> {
  const c = await ctx(req, d);
  if (c instanceof Response) return c;
  return json(200, await inbox(d.db, c.uid, c.org));
}

export async function getBoard(req: Request, d: ApiDeps): Promise<Response> {
  const c = await ctx(req, d);
  if (c instanceof Response) return c;
  const q = new URL(req.url).searchParams;
  const since = q.get("since") ?? undefined;
  const before = q.get("before") ?? undefined;
  const column = q.get("column");
  const iso = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,6})?Z$/;
  if ((since && !iso.test(since)) || (before && !iso.test(before)) || (column && !/^[1-7]$/.test(column))) return json(400, { error: "bad_query" });
  return json(200, await board(d.db, c.uid, c.org, { ...(since ? { since } : {}), ...(before ? { before } : {}), ...(column ? { column: Number(column) as ColumnNo } : {}) }));
}

/** E9b (D12, D-364): a before/after screenshot — a PNG that is never read as anything else */
export async function getShot(req: Request, d: ApiDeps, changesetId: string, name: string): Promise<Response> {
  const c = await ctx(req, d);
  if (c instanceof Response) return c;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(changesetId) || !/^(base-)?route-[0-4]\.png$/.test(name)) return json(400, { error: "bad_name" });
  const png = await changesetShot(d.db, c.uid, changesetId, name);
  if (!png) return json(404, { error: "unknown_shot" });
  return new Response(new Uint8Array(png), { status: 200, headers: { "content-type": "image/png", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'", "cache-control": "private, max-age=300" } });
}

export async function getTask(req: Request, d: ApiDeps, id: string): Promise<Response> {
  const c = await ctx(req, d);
  if (c instanceof Response) return c;
  const t = await taskDetail(d.db, c.uid, c.org, c.role, id);
  return t ? json(200, t) : json(404, { error: "unknown_task" });
}

/**
 * The workspace chat, live: Server-Sent Events of one task. The first event carries everything after the cursor (`after`
 * or Last-Event-ID `<session>:<seq>`), later ones only what changed. The stream ends after `maxMs`; EventSource reconnects
 * with Last-Event-ID, so nothing is lost. The database is read as the user on every tick (RLS).
 */
export async function streamTask(req: Request, d: ApiDeps, id: string, o: { intervalMs?: number; maxMs?: number } = {}): Promise<Response> {
  const c = await ctx(req, d);
  if (c instanceof Response) return c;
  const q = new URL(req.url).searchParams.get("after");
  if (q !== null && !/^-?\d{1,5}$/.test(q)) return json(400, { error: "bad_query" });
  const last = /^(s_[a-z0-9_]{1,40}):(-?\d{1,5})$/.exec(req.headers.get("last-event-id") ?? "");
  let session: string | null = last?.[1] ?? null;
  let after = last ? Number(last[2]) : q !== null ? Number(q) : -1;
  const first = await taskFeed(d.db, c.uid, c.org, id, after);
  if (!first) return json(404, { error: "unknown_task" });
  const intervalMs = o.intervalMs ?? 700;
  const maxMs = o.maxMs ?? 5 * 60_000;
  const enc = new TextEncoder();
  let sig = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  const body = new ReadableStream<Uint8Array>({
    start(ctl) {
      const started = Date.now();
      let pinged = started;
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        try {
          ctl.close();
        } catch {
          // already closed by the client
        }
      };
      req.signal.addEventListener("abort", close);
      const send = (f: TaskFeed) => {
        // a retry starts a new leader session: the client drops its lines and takes this one from the start
        if (f.session !== session) after = -1;
        const now = JSON.stringify([f.task.state, f.task.last_result, f.task.wait_reason, f.task.approval_needed, f.task.approved_by_human, f.task.steerable, f.task.usd, f.touching.length, f.context_pct, f.steers.length, f.session]);
        if (f.lines.length === 0 && now === sig) return;
        sig = now;
        session = f.session;
        after = f.lines.at(-1)?.seq ?? after;
        ctl.enqueue(enc.encode(`event: feed\nid: ${session ?? "none"}:${after}\ndata: ${JSON.stringify(f)}\n\n`));
      };
      const tick = async () => {
        if (closed) return;
        if (Date.now() - started >= maxMs) return close();
        try {
          let f = await taskFeed(d.db, c.uid, c.org, id, after);
          if (f && f.session !== session && after !== -1) f = await taskFeed(d.db, c.uid, c.org, id, -1);
          if (!f) return close();
          send(f);
          if (Date.now() - pinged >= 15_000) {
            pinged = Date.now();
            ctl.enqueue(enc.encode(": ping\n\n"));
          }
        } catch {
          return close();
        }
        timer = setTimeout(() => void tick(), intervalMs);
      };
      if (first.session !== session && session !== null) {
        session = null;
        after = -1;
        timer = setTimeout(() => void tick(), 0);
        return;
      }
      send(first);
      timer = setTimeout(() => void tick(), intervalMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } });
}

export async function postTask(req: Request, d: ApiDeps): Promise<Response> {
  const p = await post(req, d);
  if (p instanceof Response) return p;
  if (!d.createLimiter.take(p.uid)) return json(429, { error: "rate_limited" });
  const b = CreateTaskBody.safeParse(p.body);
  if (!b.success) return json(400, { error: "bad_body" });
  return done(await createTask(d.db, { uid: p.uid, org: p.org, body: b.data }), d);
}

export async function postStop(req: Request, d: ApiDeps, id: string): Promise<Response> {
  const p = await post(req, d);
  if (p instanceof Response) return p;
  return done(await stopTask(d.db, { uid: p.uid, taskId: id }), d);
}

export async function postRetry(req: Request, d: ApiDeps, id: string): Promise<Response> {
  const p = await post(req, d);
  if (p instanceof Response) return p;
  return done(await retryTask(d.db, { uid: p.uid, taskId: id }), d);
}

export async function postApprove(req: Request, d: ApiDeps, changesetId: string): Promise<Response> {
  if (!UUID.test(changesetId)) return json(404, { error: "unknown_changeset" });
  const p = await post(req, d);
  if (p instanceof Response) return p;
  const b = ApproveBody.safeParse(p.body);
  if (!b.success) return json(400, { error: "bad_body" });
  return done(await approve(d.db, { uid: p.uid, changesetId, body: b.data, secondFactor: d.secondFactor }), d);
}

export async function postFailureLabel(req: Request, d: ApiDeps, verdictId: string): Promise<Response> {
  if (!UUID.test(verdictId)) return json(404, { error: "unknown_verdict" });
  const p = await post(req, d);
  if (p instanceof Response) return p;
  const b = FailureLabelBody.safeParse(p.body);
  if (!b.success) return json(400, { error: "bad_body" });
  return done(await labelFailure(d.db, { uid: p.uid, verdictId, body: b.data }), d);
}

export async function postHarnessConnect(req: Request, d: ApiDeps, repoId: string): Promise<Response> {
  if (!UUID.test(repoId)) return json(404, { error: "unknown_repo" });
  const p = await post(req, d);
  if (p instanceof Response) return p;
  return done(await connectRepo(d.db, { uid: p.uid, repoId }), d);
}

export async function postHarnessApprove(req: Request, d: ApiDeps, repoId: string): Promise<Response> {
  if (!UUID.test(repoId)) return json(404, { error: "unknown_repo" });
  const p = await post(req, d);
  if (p instanceof Response) return p;
  const b = HarnessApproveBody.safeParse(p.body);
  if (!b.success) return json(400, { error: "bad_body" });
  return done(await approveHarness(d.db, { uid: p.uid, repoId, body: b.data, secondFactor: d.secondFactor }), d);
}

export async function getChannels(req: Request, d: ApiDeps): Promise<Response> {
  const c = await ctx(req, d);
  if (c instanceof Response) return c;
  return json(200, { channels: await listChannels(d.db, c.uid, c.org) });
}

export async function postSwitchChannel(req: Request, d: ApiDeps, taskId: string): Promise<Response> {
  const p = await post(req, d);
  if (p instanceof Response) return p;
  const b = SwitchBody.safeParse(p.body);
  if (!b.success) return json(400, { error: "bad_body" });
  return done(await switchChannel(d.db, { uid: p.uid, taskId, body: b.data }), d);
}

export async function postPushSubscribe(req: Request, d: ApiDeps): Promise<Response> {
  const p = await post(req, d);
  if (p instanceof Response) return p;
  const b = SubscribeBody.safeParse(p.body);
  if (!b.success) return json(400, { error: "bad_body" });
  return done(await subscribePush(d.db, { uid: p.uid, org: p.org, body: b.data }), d);
}

// D-293: API keys → the proxy (owner only). The key is in this request's memory only; the answer is the status.
export async function getKeys(req: Request, d: ApiDeps): Promise<Response> {
  const c = await ctx(req, d);
  if (c instanceof Response) return c;
  return json(200, d.keys ? await d.keys.status() : { proxy: "unavailable", providers: [] });
}

export async function postKeys(req: Request, d: ApiDeps): Promise<Response> {
  const p = await post(req, d);
  if (p instanceof Response) return p;
  // E8c: capability, not the role name
  if (!(await hasCap(d.db, p.uid, p.org, "keys.manage"))) return json(403, { error: "not_an_owner" });
  if (!d.keys) return json(503, { error: "keys_unavailable" });
  const b = KeysBody.safeParse(p.body);
  if (!b.success) return json(400, { error: "bad_keys" });
  const s = await d.keys.set({ anthropic: b.data.anthropic, ...(b.data.openai ? { openai: b.data.openai } : {}) });
  return s ? json(200, s) : json(502, { error: "proxy_start_failed" });
}

export async function deleteKeys(req: Request, d: ApiDeps): Promise<Response> {
  const p = await post(req, d);
  if (p instanceof Response) return p;
  if (!(await hasCap(d.db, p.uid, p.org, "keys.manage"))) return json(403, { error: "not_an_owner" });
  if (!d.keys) return json(503, { error: "keys_unavailable" });
  return json(200, await d.keys.clear());
}

// E8c (v5 p. 4.3): roles and member roles; every check is a capability (roles.manage / members.manage)
export async function getRoles(req: Request, d: ApiDeps): Promise<Response> {
  const c = await ctx(req, d);
  if (c instanceof Response) return c;
  const r = await listRoles(d.db, { uid: c.uid, org: c.org });
  return json(r.status, r.body);
}
export async function postRole(req: Request, d: ApiDeps): Promise<Response> {
  const p = await post(req, d);
  if (p instanceof Response) return p;
  const r = await createRole(d.db, { uid: p.uid, org: p.org, body: p.body });
  return json(r.status, r.body);
}
export async function patchRole(req: Request, d: ApiDeps, id: string): Promise<Response> {
  const p = await post(req, d);
  if (p instanceof Response) return p;
  if (!/^(builtin:[a-z-]{1,20}|[0-9a-f-]{36})$/.test(id)) return json(400, { error: "bad_role_id" });
  const r = await updateRole(d.db, { uid: p.uid, org: p.org, id, body: p.body });
  return json(r.status, r.body);
}
export async function patchMemberRole(req: Request, d: ApiDeps, member: string): Promise<Response> {
  const p = await post(req, d);
  if (p instanceof Response) return p;
  const b = (p.body ?? {}) as { role_id?: unknown };
  if (!UUID.test(member) || typeof b.role_id !== "string" || b.role_id.length > 64) return json(400, { error: "bad_request" });
  const r = await setMemberRole(d.db, { uid: p.uid, org: p.org, member, roleId: b.role_id });
  return json(r.status, r.body);
}

// E8b (v5 p. 4.2): the harness profile — approve a proposed version, roll back to an earlier one (both with a fresh TOTP)
export async function postProfileApprove(req: Request, d: ApiDeps, repoId: string): Promise<Response> {
  if (!UUID.test(repoId)) return json(404, { error: "unknown_repo" });
  const p = await post(req, d);
  if (p instanceof Response) return p;
  const b = ProfileApproveBody.safeParse(p.body);
  if (!b.success) return json(400, { error: "bad_body" });
  return done(await approveProfile(d.db, { uid: p.uid, repoId, body: b.data, secondFactor: d.secondFactor }), d);
}
export async function postProfileRollback(req: Request, d: ApiDeps, repoId: string): Promise<Response> {
  if (!UUID.test(repoId)) return json(404, { error: "unknown_repo" });
  const p = await post(req, d);
  if (p instanceof Response) return p;
  const b = ProfileRollbackBody.safeParse(p.body);
  if (!b.success) return json(400, { error: "bad_body" });
  return done(await rollbackProfile(d.db, { uid: p.uid, repoId, body: b.data, secondFactor: d.secondFactor }), d);
}

// E8g (v5 p. 4.4, AC-8.1): a person decides an ask of a HELD tool_approval task; the permission matrix is editable
export async function postAskDecision(req: Request, d: ApiDeps, taskId: string): Promise<Response> {
  if (!/^t_[a-z0-9_]{1,40}$/.test(taskId)) return json(404, { error: "unknown_task" });
  const p = await post(req, d);
  if (p instanceof Response) return p;
  const b = AskDecisionBody.safeParse(p.body);
  if (!b.success) return json(400, { error: "bad_body" });
  return done(await decideAsk(d.db, { uid: p.uid, taskId, body: b.data, secondFactor: d.secondFactor }), d);
}
export async function postPermission(req: Request, d: ApiDeps): Promise<Response> {
  const p = await post(req, d);
  if (p instanceof Response) return p;
  const b = PermissionBody.safeParse(p.body);
  if (!b.success) return json(400, { error: "bad_body" });
  return done(await setPermission(d.db, { uid: p.uid, org: p.org, body: b.data, secondFactor: d.secondFactor }), d);
}
export async function postSteer(req: Request, d: ApiDeps, taskId: string): Promise<Response> {
  if (!/^t_[a-z0-9_]{1,40}$/.test(taskId)) return json(404, { error: "unknown_task" });
  const p = await post(req, d);
  if (p instanceof Response) return p;
  const b = (p.body ?? {}) as { text?: unknown };
  if (typeof b.text !== "string") return json(400, { error: "bad_text" });
  return done(await steerTask(d.db, { uid: p.uid, taskId, text: b.text }), d);
}

// E8e (v5 p. 4.5): the MCP catalog — search the official registry, add (exact version), approve (→ vetting by the worker)
export async function getMcpRegistry(req: Request, d: ApiDeps): Promise<Response> {
  const c = await ctx(req, d);
  if (c instanceof Response) return c;
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 100);
  try {
    const rows = await listRegistry({ fetch: (u) => fetch(u, { signal: AbortSignal.timeout(10_000) }), query: q, limit: 100 });
    return json(200, { servers: rows.slice(0, 30).map((r) => ({ name: r.name, description: r.description, versions: r.versions })) });
  } catch {
    return json(502, { error: "registry_unreachable" });
  }
}
export async function postMcpServer(req: Request, d: ApiDeps): Promise<Response> {
  const p = await post(req, d);
  if (p instanceof Response) return p;
  return done(await addMcpServer(d.db, { uid: p.uid, org: p.org, body: p.body, fetch: (u) => fetch(u, { signal: AbortSignal.timeout(10_000) }) }), d);
}
export async function postMcpApprove(req: Request, d: ApiDeps, id: string): Promise<Response> {
  if (!UUID.test(id)) return json(404, { error: "unknown_server" });
  const p = await post(req, d);
  if (p instanceof Response) return p;
  const b = ApproveMcpBody.safeParse(p.body);
  if (!b.success) return json(400, { error: "bad_body" });
  return done(await approveMcpServer(d.db, { uid: p.uid, id, body: b.data, secondFactor: d.secondFactor }), d);
}
export async function postFixCi(req: Request, d: ApiDeps, id: string): Promise<Response> {
  if (!/^t_[a-z0-9_]{1,40}$/.test(id)) return json(404, { error: "unknown_task" });
  const p = await post(req, d);
  if (p instanceof Response) return p;
  return done(await fixCiTask(d.db, { uid: p.uid, taskId: id }), d);
}
export async function postApplyComments(req: Request, d: ApiDeps, id: string): Promise<Response> {
  if (!/^t_[a-z0-9_]{1,40}$/.test(id)) return json(404, { error: "unknown_task" });
  const p = await post(req, d);
  if (p instanceof Response) return p;
  const b = (p.body ?? {}) as { text?: unknown };
  if (typeof b.text !== "string") return json(400, { error: "bad_text" });
  return done(await applyComments(d.db, { uid: p.uid, taskId: id, text: b.text }), d);
}

// E9a (v5 5.1 (2)): plan the night; answer or close a parked task's question in the morning
export async function postNightPlan(req: Request, d: ApiDeps): Promise<Response> {
  const p = await post(req, d);
  if (p instanceof Response) return p;
  return done(await planNight(d.db, { uid: p.uid, org: p.org, body: p.body }), d);
}
export async function postNightAnswer(req: Request, d: ApiDeps, id: string): Promise<Response> {
  const p = await post(req, d);
  if (p instanceof Response) return p;
  const b = (p.body ?? {}) as { answer?: unknown };
  if (typeof b.answer !== "string") return json(400, { error: "bad_answer" });
  return done(await answerQuestion(d.db, { uid: p.uid, id, answer: b.answer }), d);
}
export async function postNightClose(req: Request, d: ApiDeps, id: string): Promise<Response> {
  const p = await post(req, d);
  if (p instanceof Response) return p;
  return done(await closeQuestion(d.db, { uid: p.uid, id }), d);
}

// E9b (D5, D-362): upload a new version of the repo's hidden tests (approve.rules + a fresh TOTP)
export async function postHiddenTests(req: Request, d: ApiDeps, repoId: string): Promise<Response> {
  if (!UUID.test(repoId)) return json(404, { error: "unknown_repo" });
  const p = await post(req, d);
  if (p instanceof Response) return p;
  return done(await uploadHidden(d.db, { uid: p.uid, repoId, body: p.body, secondFactor: d.secondFactor }), d);
}
