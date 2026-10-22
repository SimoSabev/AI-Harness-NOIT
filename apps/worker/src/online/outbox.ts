// T3-2 (демо промпт т. 3.4): effects run after commit, idempotent by idempotency_key; a repeated drain never repeats an effect.

export type OutboxKind = "check_run" | "draft_pr" | "ready_for_review" | "approval_check" | "merge" | "push_branch" | "web_push" | "harness_scan" | "harness_pr" | "baseline" | "proxy_restart";
export interface OutboxRow {
  id: number;
  org_id: string;
  kind: OutboxKind;
  idempotency_key: string;
  payload: Record<string, unknown>;
  attempts: number;
}
export interface OutboxStore {
  /** pending rows, locked for this drain (FOR UPDATE SKIP LOCKED) */
  claim(limit: number): Promise<OutboxRow[]>;
  markDone(id: number): Promise<void>;
  markFailed(id: number, error: string, final: boolean): Promise<void>;
  /** commit/rollback of the claim transaction */
  release(): Promise<void>;
}
/** An effect handler must itself be idempotent by key (e.g. a check run with external_id = key). */
export type EffectHandler = (row: OutboxRow) => Promise<void>;

export const MAX_ATTEMPTS = 8;

export async function drainOutbox(store: OutboxStore, handlers: Partial<Record<OutboxKind, EffectHandler>>, o: { limit?: number } = {}): Promise<{ done: number; failed: number; skipped: number }> {
  const r = { done: 0, failed: 0, skipped: 0 };
  const rows = await store.claim(o.limit ?? 50);
  try {
    for (const row of rows) {
      const h = handlers[row.kind];
      if (!h) {
        r.skipped++;
        continue;
      }
      try {
        await h(row);
        await store.markDone(row.id);
        r.done++;
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        await store.markFailed(row.id, msg, row.attempts + 1 >= MAX_ATTEMPTS);
        r.failed++;
      }
    }
  } finally {
    await store.release();
  }
  return r;
}

/** In-memory store with the same semantics as the SQL one (unit tests, offline demo). */
export class MemoryOutbox implements OutboxStore {
  rows: (OutboxRow & { status: "pending" | "done" | "failed"; last_error: string | null })[] = [];
  private seq = 0;
  private locked = new Set<number>();
  insert(r: { org_id: string; kind: OutboxKind; idempotency_key: string; payload?: Record<string, unknown> }): boolean {
    if (this.rows.some((x) => x.idempotency_key === r.idempotency_key)) return false; // unique key
    this.rows.push({ id: ++this.seq, org_id: r.org_id, kind: r.kind, idempotency_key: r.idempotency_key, payload: r.payload ?? {}, attempts: 0, status: "pending", last_error: null });
    return true;
  }
  claim(limit: number): Promise<OutboxRow[]> {
    const out = this.rows.filter((x) => x.status === "pending" && !this.locked.has(x.id)).slice(0, limit);
    for (const x of out) this.locked.add(x.id);
    return Promise.resolve(out.map((x) => ({ id: x.id, org_id: x.org_id, kind: x.kind, idempotency_key: x.idempotency_key, payload: x.payload, attempts: x.attempts })));
  }
  markDone(id: number): Promise<void> {
    const x = this.rows.find((r) => r.id === id);
    if (x) x.status = "done";
    return Promise.resolve();
  }
  markFailed(id: number, error: string, final: boolean): Promise<void> {
    const x = this.rows.find((r) => r.id === id);
    if (x) {
      x.attempts++;
      x.last_error = error;
      x.status = final ? "failed" : "pending";
    }
    return Promise.resolve();
  }
  release(): Promise<void> {
    this.locked.clear();
    return Promise.resolve();
  }
}
