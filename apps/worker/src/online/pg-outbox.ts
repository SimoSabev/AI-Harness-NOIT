import type { SqlClient } from "@mandat/ledger";
import type { OutboxRow, OutboxStore } from "./outbox.js";

/**
 * T3-2 on Postgres: one transaction per drain on a DEDICATED connection; rows locked FOR UPDATE SKIP LOCKED so two
 * workers never take the same effect. The effect runs inside the claim; done/failed are written before COMMIT.
 */
export class PgOutbox implements OutboxStore {
  private open = false;
  constructor(private readonly db: SqlClient) {}
  async claim(limit: number): Promise<OutboxRow[]> {
    await this.db.query("begin");
    this.open = true;
    const r = await this.db.query<OutboxRow>(
      "select id::int as id, org_id::text as org_id, kind, idempotency_key, payload, attempts from public.outbox where status = 'pending' order by id limit $1 for update skip locked",
      [limit],
    );
    return r.rows;
  }
  async markDone(id: number): Promise<void> {
    await this.db.query("update public.outbox set status = 'done', done_at = now() where id = $1", [id]);
  }
  async markFailed(id: number, error: string, final: boolean): Promise<void> {
    await this.db.query("update public.outbox set attempts = attempts + 1, last_error = $2, status = case when $3 then 'failed' else 'pending' end where id = $1", [id, error, final]);
  }
  async release(): Promise<void> {
    if (this.open) await this.db.query("commit");
    this.open = false;
  }
}

/** Inserts an effect in the caller's transaction; a repeated key is a no-op (idempotent). */
export async function enqueueOutbox(db: SqlClient, r: { org_id: string; kind: OutboxRow["kind"]; idempotency_key: string; payload?: Record<string, unknown> }): Promise<boolean> {
  const q = await db.query<{ id: number }>(
    "insert into public.outbox (org_id, kind, idempotency_key, payload) values ($1::uuid, $2, $3, $4::jsonb) on conflict (idempotency_key) do nothing returning id",
    [r.org_id, r.kind, r.idempotency_key, JSON.stringify(r.payload ?? {})],
  );
  return q.rows.length > 0;
}
