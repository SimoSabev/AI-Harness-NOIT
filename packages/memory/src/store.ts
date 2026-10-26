import { MemoryItem } from "@mandat/contract";
import type { MemoryNote, MemoryPatch, MemoryProvenance, MemorySource, MemoryStatus } from "@mandat/contract";
import type { ConsolidationPlan } from "./consolidate.js";
import { conflictsWith } from "./consolidate.js";
import { initialStatus, scanMemory } from "./policy.js";
import type { ScanReason } from "./policy.js";
import { entitiesOf, normalizeKey } from "./text.js";

// D-392: the memory tables (supabase/migrations/*_memory.sql) as functions. The caller runs them as the server
// (service_role) after its own permission check; every function still keeps to the org and to the person's own
// user-scope memories. Every change is a memory_events row (the history the menu shows).

export interface MemorySql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export type Actor = `human:${string}` | "agent" | "worker" | "consolidation";

const TS = (c: string) => `to_char(${c} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
const COLS = `m.id::text as id, m.scope, m.kind, m.text, m.status, m.source, m.basis, m.repo_id::text as repo_id, m.entities, m.pinned, m.uses,
  ${TS("m.last_used_at")} as last_used_at, ${TS("m.created_at")} as created_at, ${TS("m.invalid_at")} as invalid_at, m.superseded_by::text as superseded_by, m.provenance`;
// the person's view: their own user-scope memories and the org's project memories
const MINE = "m.org_id = $1::uuid and (m.scope = 'project' or m.user_id = $2::uuid)";

const toItem = (r: unknown): MemoryItem => MemoryItem.parse(r);

export async function loadMemory(sql: MemorySql, o: { org: string; user: string; repo?: string | null; statuses?: readonly MemoryStatus[] }): Promise<MemoryItem[]> {
  const params: unknown[] = [o.org, o.user];
  let where = MINE;
  if (o.repo) {
    params.push(o.repo);
    where += ` and (m.scope = 'user' or m.repo_id = $${params.length}::uuid)`;
  }
  if (o.statuses) {
    params.push([...o.statuses]);
    where += ` and m.status = any($${params.length}::text[])`;
  }
  const r = await sql.query(`select ${COLS} from public.memory_items m where ${where} order by m.created_at, m.id`, params);
  return r.rows.map(toItem);
}

async function one(sql: MemorySql, o: { org: string; user: string; id: string }): Promise<MemoryItem | null> {
  const r = await sql.query(`select ${COLS} from public.memory_items m where ${MINE} and m.id = $3::uuid`, [o.org, o.user, o.id]);
  return r.rows[0] ? toItem(r.rows[0]) : null;
}

async function event(sql: MemorySql, o: { org: string; id: string; action: string; actor: Actor; before?: unknown; after?: unknown; task_id?: string | null }): Promise<void> {
  await sql.query("insert into public.memory_events (org_id, item_id, action, actor, before, after, task_id) values ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6::jsonb, $7)", [
    o.org, o.id, o.action, o.actor, o.before === undefined ? null : JSON.stringify(o.before), o.after === undefined ? null : JSON.stringify(o.after), o.task_id ?? null,
  ]);
}

/** Makes the active memories a fresh one contradicts invalid (update on write); returns their ids. */
async function supersede(sql: MemorySql, org: string, user: string, fresh: MemoryItem, actor: Actor): Promise<string[]> {
  const shelf = await loadMemory(sql, { org, user, statuses: ["active"] });
  const old = conflictsWith(fresh, shelf);
  for (const id of old) {
    await sql.query("update public.memory_items set status = 'invalid', invalid_at = now(), superseded_by = $3::uuid, updated_at = now() where org_id = $1::uuid and id = $2::uuid", [org, id, fresh.id]);
    await event(sql, { org, id, action: "superseded", actor, after: { by: fresh.id } });
  }
  return old;
}

export type AddResult = { ok: true; item: MemoryItem; superseded: string[] } | { ok: false; reason: ScanReason | "duplicate" | "no_repo" };

export async function addMemory(sql: MemorySql, o: {
  org: string; user: string; note: MemoryNote; source: MemorySource; actor: Actor; provenance?: MemoryProvenance; exactSecrets?: readonly string[];
  /** the person who wrote it (default: user); null for an agent's proposal in a task nobody started */
  createdBy?: string | null;
}): Promise<AddResult> {
  const n = o.note;
  if (n.scope === "project" && !n.repo_id) return { ok: false, reason: "no_repo" };
  const scan = scanMemory(n.text, o.exactSecrets);
  if (!scan.ok) return scan;
  const same = await loadMemory(sql, { org: o.org, user: o.user, statuses: ["active", "pending"] });
  const key = normalizeKey(n.text);
  if (same.some((m) => m.scope === n.scope && m.repo_id === (n.scope === "project" ? (n.repo_id ?? null) : null) && normalizeKey(m.text) === key)) return { ok: false, reason: "duplicate" };
  const basis = o.source === "agent_session" || o.source === "agent_sandbox" ? n.basis : null;
  const status = initialStatus(o.source, basis);
  const r = await sql.query<{ id: string }>(
    `insert into public.memory_items (org_id, user_id, repo_id, scope, kind, text, status, source, basis, entities, provenance, created_by)
     values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::text[], $11::jsonb, $12::uuid) returning id::text as id`,
    [o.org, n.scope === "user" ? o.user : null, n.scope === "project" ? n.repo_id : null, n.scope, n.kind, n.text, status, o.source, basis, entitiesOf(n.text), JSON.stringify(o.provenance ?? {}), o.createdBy === undefined ? o.user : o.createdBy],
  );
  const id = r.rows[0]?.id ?? "";
  await event(sql, { org: o.org, id, action: "created", actor: o.actor, after: { text: n.text, status }, task_id: o.provenance?.task_id ?? null });
  const item = await one(sql, { org: o.org, user: o.user, id });
  if (!item) throw new Error("memory insert lost");
  return { ok: true, item, superseded: status === "active" ? await supersede(sql, o.org, o.user, item, o.actor) : [] };
}

export type PatchResult = { ok: true; item: MemoryItem } | { ok: false; reason: ScanReason | "not_found" | "bad_state" };

const FROM: Record<Exclude<MemoryPatch["action"], "edit" | "pin">, readonly MemoryStatus[]> = {
  approve: ["pending"], reject: ["pending"], archive: ["active", "pending"], restore: ["archived", "rejected", "invalid"],
};
const TO = { approve: "active", reject: "rejected", archive: "archived", restore: "active" } as const;
const DONE = { approve: "approved", reject: "rejected", archive: "archived", restore: "restored" } as const;

export async function patchMemory(sql: MemorySql, o: { org: string; user: string; id: string; patch: MemoryPatch; actor: Actor; exactSecrets?: readonly string[] }): Promise<PatchResult> {
  const cur = await one(sql, o);
  if (!cur) return { ok: false, reason: "not_found" };
  const p = o.patch;
  if (p.action === "edit") {
    const text = p.text ?? cur.text;
    const scan = scanMemory(text, o.exactSecrets);
    if (!scan.ok) return scan;
    await sql.query("update public.memory_items set text = $3, kind = $4, entities = $5::text[], updated_at = now() where org_id = $1::uuid and id = $2::uuid", [o.org, o.id, text, p.kind ?? cur.kind, entitiesOf(text)]);
    await event(sql, { org: o.org, id: o.id, action: "edited", actor: o.actor, before: { text: cur.text, kind: cur.kind }, after: { text, kind: p.kind ?? cur.kind } });
  } else if (p.action === "pin") {
    await sql.query("update public.memory_items set pinned = $3, updated_at = now() where org_id = $1::uuid and id = $2::uuid", [o.org, o.id, p.pinned]);
    await event(sql, { org: o.org, id: o.id, action: p.pinned ? "pinned" : "unpinned", actor: o.actor });
  } else {
    if (!FROM[p.action].includes(cur.status)) return { ok: false, reason: "bad_state" };
    await sql.query("update public.memory_items set status = $3, invalid_at = null, updated_at = now() where org_id = $1::uuid and id = $2::uuid", [o.org, o.id, TO[p.action]]);
    await event(sql, { org: o.org, id: o.id, action: DONE[p.action], actor: o.actor, before: { status: cur.status } });
  }
  const item = await one(sql, o);
  if (!item) return { ok: false, reason: "not_found" };
  if (item.status === "active" && (p.action === "approve" || p.action === "restore" || p.action === "edit")) await supersede(sql, o.org, o.user, item, o.actor);
  return { ok: true, item };
}

/** Deletes a memory and its history (the person's right); false if it is not theirs to delete. */
export async function deleteMemory(sql: MemorySql, o: { org: string; user: string; id: string }): Promise<boolean> {
  const r = await sql.query("delete from public.memory_items m where " + MINE + " and m.id = $3::uuid returning m.id", [o.org, o.user, o.id]);
  return r.rows.length > 0;
}

export interface MemoryEvent { action: string; actor: string; before: unknown; after: unknown; task_id: string | null; at: string }

export async function memoryHistory(sql: MemorySql, o: { org: string; user: string; id: string }): Promise<MemoryEvent[]> {
  if (!(await one(sql, o))) return [];
  const r = await sql.query<MemoryEvent>(`select e.action, e.actor, e.before, e.after, e.task_id, ${TS("e.created_at")} as at from public.memory_events e where e.org_id = $1::uuid and e.item_id = $2::uuid order by e.id`, [o.org, o.id]);
  return r.rows;
}

/** What memory cost a task; the memories it carried get a use. Once per (task, attempt). */
export async function recordUsage(sql: MemorySql, o: { org: string; task_id: string; attempt: number; core_tokens: number; recall_tokens: number; ids: readonly string[]; hash: string | null }): Promise<void> {
  const r = await sql.query(
    "insert into public.memory_usage (org_id, task_id, attempt, core_tokens, recall_tokens, items, block_hash) values ($1::uuid, $2, $3, $4, $5, $6, $7) on conflict (task_id, attempt) do nothing returning id",
    [o.org, o.task_id, o.attempt, o.core_tokens, o.recall_tokens, o.ids.length, o.hash],
  );
  if (r.rows.length === 0 || o.ids.length === 0) return;
  await sql.query("update public.memory_items set uses = uses + 1, last_used_at = now() where org_id = $1::uuid and id = any($2::uuid[])", [o.org, [...o.ids]]);
}

export async function usageRows(sql: MemorySql, org: string, limit = 50): Promise<{ task_id: string; core_tokens: number; recall_tokens: number; items: number }[]> {
  const r = await sql.query<{ task_id: string; core_tokens: number; recall_tokens: number; items: number }>(
    "select task_id, core_tokens, recall_tokens, items from public.memory_usage where org_id = $1::uuid order by id desc limit $2", [org, limit],
  );
  return r.rows;
}

/** Applies duplicates (archive → the kept one) and contradictions (invalid → the newer one); stale stays a suggestion. */
export async function applyConsolidation(sql: MemorySql, o: { org: string; plan: ConsolidationPlan }): Promise<{ merged: number; superseded: number }> {
  let merged = 0;
  let superseded = 0;
  for (const d of o.plan.duplicates) {
    const r = await sql.query("update public.memory_items set status = 'archived', superseded_by = $3::uuid, updated_at = now() where org_id = $1::uuid and id = $2::uuid and status = 'active' returning id", [o.org, d.drop, d.keep]);
    if (r.rows.length === 0) continue;
    merged++;
    await event(sql, { org: o.org, id: d.drop, action: "merged", actor: "consolidation", after: { into: d.keep } });
  }
  for (const s of o.plan.supersede) {
    const r = await sql.query("update public.memory_items set status = 'invalid', invalid_at = now(), superseded_by = $3::uuid, updated_at = now() where org_id = $1::uuid and id = $2::uuid and status = 'active' returning id", [o.org, s.old, s.by]);
    if (r.rows.length === 0) continue;
    superseded++;
    await event(sql, { org: o.org, id: s.old, action: "superseded", actor: "consolidation", after: { by: s.by } });
  }
  return { merged, superseded };
}
