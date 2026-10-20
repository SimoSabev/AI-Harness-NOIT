import { ApproveBody, CreateTaskBody, FailureLabelBody, approve, createTask, labelFailure, retryTask, stopTask } from "./actions";
import type { Result, SecondFactor } from "./actions";
import { checkCsrf, checkOrigin, readJsonBody } from "./guard";
import type { RateLimiter } from "./guard";
import { SwitchBody, listChannels, switchChannel } from "./channels";
import { SubscribeBody, subscribePush } from "./push";
import { HarnessApproveBody, approveHarness, connectRepo } from "./harness";
import { board, inbox, membership, taskDetail } from "./queries";
import type { Db } from "./sql";
import { UUID } from "./sql";
import type { ColumnNo } from "../board";

// Демо промпт т. 8.1: the internal API as plain functions (Request → Response); app/api/**/route.ts only wires deps.
export interface ApiDeps {
  db: Db;
  /** the signed-in user's id, or null */
  user: (req: Request) => Promise<string | null>;
  secondFactor: SecondFactor;
  broadcast?: (topic: string, event: string, payload: Record<string, unknown>) => Promise<void>;
  createLimiter: RateLimiter;
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
