import { MemoryNote, MemoryPatch } from "@mandat/contract";
import type { MemoryItem } from "@mandat/contract";
import { addMemory, applyConsolidation, consolidationPlan, deleteMemory, loadMemory, memoryAsOf, memoryHistory, memoryTokens, patchMemory, renderCore, staleAgainstRepo, usageRows, usageSummary } from "@mandat/memory";
import type { MemoryEvent, TimedEvent, UsageSummary } from "@mandat/memory";
import { repoFacts } from "@mandat/worker";
import { UUID, asService, asUser } from "./sql";
import type { Db } from "./sql";
import type { Role } from "./queries";

// D-400: the memory menu. Every member keeps their own memory (user scope); project memory is written by owners and
// approvers and read by every member. Reads go under RLS as the person; writes as the server after these checks.

type Res = { status: number; body: Record<string, unknown> };
const err = (status: number, error: string): Res => ({ status, body: { error } });
const canAct = (r: Role) => r === "owner" || r === "approver";
const actor = (uid: string) => `human:${uid}` as const;

export interface MemoryOverview {
  items: MemoryItem[];
  /** repo id → name */
  repos: Record<string, string>;
  pending: number;
  /** the core of the person (user part) and what all active memory would take */
  tokens: { core: number; all: number; fill: number };
  usage: UsageSummary;
}

export async function memoryOverview(db: Db, uid: string, org: string): Promise<MemoryOverview> {
  return asUser(db, uid, async (sql) => {
    const items = (await loadMemory(sql, { org, user: uid })).filter((m) => m.status !== "rejected");
    const repos = Object.fromEntries((await sql.query<{ id: string; full_name: string }>("select id::text as id, full_name from public.repos where org_id = $1::uuid order by full_name", [org])).rows.map((r) => [r.id, r.full_name]));
    const t = memoryTokens(items, null);
    return {
      items, repos, pending: items.filter((m) => m.status === "pending").length,
      tokens: { core: t.core, all: t.all, fill: renderCore(items, null).fill.user },
      usage: usageSummary(await usageRows(sql, org), t.all),
    };
  });
}

export async function memoryHistoryWeb(db: Db, uid: string, org: string, id: string): Promise<MemoryEvent[]> {
  if (!UUID.test(id)) return [];
  return asUser(db, uid, (sql) => memoryHistory(sql, { org, user: uid, id }));
}

/** Round 2: the memory the person sees, as it was at the end of a day (YYYY-MM-DD), replayed from its history. */
export async function memoryAsOfWeb(db: Db, uid: string, org: string, day: string): Promise<MemoryItem[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  return asUser(db, uid, async (sql) => {
    const items = await loadMemory(sql, { org, user: uid });
    const ev = items.length === 0 ? [] : (await sql.query<TimedEvent & { item_id: string }>(
      `select e.item_id::text as item_id, e.action, e.before, e.after, to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at
         from public.memory_events e where e.org_id = $1::uuid and e.item_id = any($2::uuid[]) order by e.id`,
      [org, items.map((m) => m.id)],
    )).rows;
    const history: Record<string, TimedEvent[]> = {};
    for (const e of ev) (history[e.item_id] ??= []).push(e);
    return memoryAsOf(items, history, `${day}T23:59:59.999Z`);
  });
}

/** Round 2: active project memories naming a file or script their local project's main lacks → id → reasons. */
export async function staleMemoriesWeb(db: Db, uid: string, org: string): Promise<Record<string, string[]>> {
  const { items, repos } = await asUser(db, uid, async (sql) => ({
    items: (await loadMemory(sql, { org, user: uid, statuses: ["active"] })).filter((m) => m.scope === "project" && m.repo_id),
    repos: (await sql.query<{ id: string; remote_url: string }>("select id::text as id, remote_url from public.repos where org_id = $1::uuid", [org])).rows,
  }));
  const out: Record<string, string[]> = {};
  for (const r of repos) {
    const mine = items.filter((m) => m.repo_id === r.id);
    if (mine.length === 0) continue;
    const facts = await repoFacts(r.remote_url).catch(() => null);
    if (!facts) continue; // not on this computer, or unreadable: not checked
    for (const s of staleAgainstRepo(mine, facts)) out[s.id] = s.why;
  }
  return out;
}

export async function createMemoryWeb(db: Db, o: { uid: string; org: string; role: Role; body: unknown }): Promise<Res> {
  const p = MemoryNote.safeParse(o.body);
  if (!p.success) return err(400, "bad_request");
  if (p.data.scope === "project" && !canAct(o.role)) return err(403, "no_capability");
  const r = await asService(db, (sql) => addMemory(sql, { org: o.org, user: o.uid, note: p.data, source: "human", actor: actor(o.uid) }));
  return r.ok ? { status: 201, body: { item: r.item, superseded: r.superseded } } : err(422, `memory_${r.reason}`);
}

async function scopeOf(db: Db, uid: string, org: string, id: string): Promise<MemoryItem["scope"] | null> {
  const r = await asUser(db, uid, (sql) => sql.query<{ scope: MemoryItem["scope"] }>("select scope from public.memory_items where org_id = $1::uuid and id = $2::uuid", [org, id]));
  return r.rows[0]?.scope ?? null;
}

export async function patchMemoryWeb(db: Db, o: { uid: string; org: string; role: Role; id: string; body: unknown }): Promise<Res> {
  const p = MemoryPatch.safeParse(o.body);
  if (!UUID.test(o.id) || !p.success) return err(400, "bad_request");
  const scope = await scopeOf(db, o.uid, o.org, o.id);
  if (!scope) return err(404, "not_found");
  if (scope === "project" && !canAct(o.role)) return err(403, "no_capability");
  const r = await asService(db, (sql) => patchMemory(sql, { org: o.org, user: o.uid, id: o.id, patch: p.data, actor: actor(o.uid) }));
  if (r.ok) return { status: 200, body: { item: r.item } };
  return r.reason === "not_found" ? err(404, "not_found") : r.reason === "bad_state" ? err(409, "bad_state") : err(422, `memory_${r.reason}`);
}

export async function deleteMemoryWeb(db: Db, o: { uid: string; org: string; role: Role; id: string }): Promise<Res> {
  if (!UUID.test(o.id)) return err(400, "bad_request");
  const scope = await scopeOf(db, o.uid, o.org, o.id);
  if (!scope) return err(404, "not_found");
  if (scope === "project" && !canAct(o.role)) return err(403, "no_capability");
  const ok = await asService(db, (sql) => deleteMemory(sql, { org: o.org, user: o.uid, id: o.id }));
  return ok ? { status: 200, body: { deleted: true } } : err(404, "not_found");
}

/** "Tidy up": merges duplicates and makes contradicted memories invalid; long-unused ones come back as suggestions. */
export async function consolidateMemoryWeb(db: Db, o: { uid: string; org: string; role: Role }): Promise<Res> {
  const items = await asUser(db, o.uid, (sql) => loadMemory(sql, { org: o.org, user: o.uid, statuses: ["active"] }));
  // a viewer tidies only their own memory; project memory is for owners and approvers
  const mine = canAct(o.role) ? items : items.filter((m) => m.scope === "user");
  const plan = consolidationPlan(mine, new Date());
  const done = await asService(db, (sql) => applyConsolidation(sql, { org: o.org, plan }));
  return { status: 200, body: { ...done, stale: plan.stale } };
}
