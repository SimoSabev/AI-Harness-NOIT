import { ApproveBody, CreateTaskBody, FailureLabelBody, approve, createTask, labelFailure, retryTask, stopTask } from "./actions";
import type { Result, SecondFactor } from "./actions";
import { checkCsrf, checkOrigin, readJsonBody } from "./guard";
import type { RateLimiter } from "./guard";
import { SwitchBody, listChannels, switchChannel } from "./channels";
import { SubscribeBody, subscribePush } from "./push";
import { HarnessApproveBody, approveHarness, connectRepo } from "./harness";
import { KeysBody } from "./keys";
import type { KeysClient } from "./keys";
import { board, inbox, membership, taskDetail } from "./queries";
import { createRole, hasCap, listRoles, setMemberRole, updateRole } from "./roles";
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

export async function getTask(req: Request, d: ApiDeps, id: string): Promise<Response> {
  const c = await ctx(req, d);
  if (c instanceof Response) return c;
  const t = await taskDetail(d.db, c.uid, c.org, c.role, id);
  return t ? json(200, t) : json(404, { error: "unknown_task" });
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
