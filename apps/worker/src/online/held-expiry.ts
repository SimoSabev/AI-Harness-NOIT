import { appendLedgerOnline } from "@mandat/ledger";
import type { SqlClient } from "@mandat/ledger";
import { enqueueOutbox } from "./pg-outbox.js";

// E8g (v5 p. 4.4): HELD is a wait for a person, not a parking lot. held_until is set by the DB on entering HELD
// (now + 7 days); MANDAT_HELD_DAYS shortens it (counted from state_entered_at). The sweeper closes what is overdue.
export const HELD_DAYS = 7;

export function heldDays(env: Record<string, string | undefined>): number {
  const v = env.MANDAT_HELD_DAYS;
  const n = v && /^\d+$/.test(v) ? Number(v) : 0;
  return n >= 1 ? n : HELD_DAYS;
}

/** Closes overdue HELD tasks (CLOSED, wait_reason expired): one ledger task_stopped and one web_push each. */
export async function closeExpiredHeld(db: SqlClient, o: { now: Date; days?: number }): Promise<string[]> {
  const days = o.days ?? HELD_DAYS;
  const due = await db.query<{ id: string; org_id: string; attempt: number }>(
    `select id, org_id::text as org_id, attempt from public.tasks
      where state = 'HELD' and (held_until <= $1::timestamptz or state_entered_at + make_interval(days => $2::int) <= $1::timestamptz)
      order by id`,
    [o.now.toISOString(), days],
  );
  const closed: string[] = [];
  for (const t of due.rows) {
    const r = await db.query<{ id: string }>(
      "update public.tasks set state = 'CLOSED', wait_reason = 'expired', state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1 and state = 'HELD' returning id",
      [t.id],
    );
    if (r.rows.length === 0) continue; // someone acted on it in the meantime
    await appendLedgerOnline(db, { org_id: t.org_id, kind: "task_stopped", task_id: t.id, payload: { reason: "expired", days } });
    await enqueueOutbox(db, { org_id: t.org_id, kind: "web_push", idempotency_key: `push:${t.id}:${t.attempt}:expired`, payload: { task_id: t.id, kind: "expired" } });
    closed.push(t.id);
  }
  return closed;
}
