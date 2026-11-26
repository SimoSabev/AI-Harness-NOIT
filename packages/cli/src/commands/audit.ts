import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AuditVerdict, MandatError } from "@mandat/contract";
import type { AuditSelection } from "@mandat/contract";
import { appendLedgerOnline, buildAuditExport, readLedgerOnline, verifyAuditExport } from "@mandat/ledger";
import type { SqlClient } from "@mandat/ledger";
import { displayPath, printJson, shortHash } from "../output.js";
import type { Io } from "../output.js";

// E10 hosted (v5 т. 6.1, D-704): `mandat audit export --task <id> | --period <p> [--org] [--as <user>]` and
// `mandat verify-log --audit <file>`. Exit codes: 0 ok, 1 tampered, 2 usage, 3 not found, 4 not allowed (--as).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type AuditDb = SqlClient & { connect?: () => Promise<SqlClient & { release(): void }>; end?: () => Promise<void> };

const day = (s: string): number => {
  const t = Date.parse(`${s}T00:00:00.000Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== s) throw new MandatError("E_USAGE", `bad --period day: ${s}`);
  return t;
};

/** `YYYY-MM` (a month), `YYYY-MM-DD..YYYY-MM-DD` (days, both included) or `<ISO>/<ISO>`; always [from, to) in UTC */
export function parsePeriod(p: string): { from: string; to: string } {
  let from: number;
  let to: number;
  const month = /^(\d{4})-(\d{2})$/.exec(p);
  const days = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(p);
  const iso = /^([^/]+)\/([^/]+)$/.exec(p);
  if (month) {
    const y = Number(month[1]);
    const m = Number(month[2]);
    if (m < 1 || m > 12) throw new MandatError("E_USAGE", `bad --period month: ${p}`);
    from = Date.UTC(y, m - 1, 1);
    to = Date.UTC(y, m, 1);
  } else if (days) {
    from = day(days[1] as string);
    to = day(days[2] as string) + 86_400_000;
  } else if (iso && /^\d{4}-\d{2}-\d{2}T/.test(iso[1] as string)) {
    from = Date.parse(iso[1] as string);
    to = Date.parse(iso[2] as string);
  } else {
    throw new MandatError("E_USAGE", `bad --period: ${p} (YYYY-MM, YYYY-MM-DD..YYYY-MM-DD or ISO/ISO)`);
  }
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new MandatError("E_USAGE", `bad --period: ${p} (the start must be before the end)`);
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

/** runs fn as the user under RLS (role authenticated + its claims), as the web does; without `as`, as the operator */
async function withRole<T>(db: AuditDb, as: string | null, fn: (sql: SqlClient) => Promise<T>): Promise<T> {
  if (as === null) return fn(db);
  const c = db.connect ? await db.connect() : { ...db, release: () => undefined };
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: as, role: "authenticated" })]);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

export async function auditExport(io: Io, o: { db: AuditDb; task?: string; period?: string; org?: string; as?: string; out?: string; json: boolean; now?: () => Date }): Promise<number> {
  if ((o.task === undefined) === (o.period === undefined)) throw new MandatError("E_USAGE", "give exactly one of --task <id> or --period <p>");
  if (o.org !== undefined && !UUID.test(o.org)) throw new MandatError("E_USAGE", "--org must be an org uuid");
  if (o.as !== undefined && !UUID.test(o.as)) throw new MandatError("E_USAGE", "--as must be a user uuid");
  if (o.task !== undefined && !/^t_[a-z0-9_]{1,40}$/.test(o.task)) throw new MandatError("E_USAGE", "--task must be a task id (t_…)");
  const selection: AuditSelection = o.task !== undefined ? { task: o.task } : parsePeriod(o.period as string);
  try {
    let org = o.org;
    if (o.task !== undefined) {
      const t = (await o.db.query<{ org_id: string }>("select org_id::text as org_id from public.tasks where id = $1", [o.task])).rows[0];
      if (!t) {
        io.stderr(`unknown task: ${o.task}\n`);
        return 3;
      }
      if (org !== undefined && org !== t.org_id) throw new MandatError("E_USAGE", `${o.task} is not a task of --org ${org}`);
      org = t.org_id;
    }
    if (org === undefined) throw new MandatError("E_USAGE", "--period needs --org <uuid>");
    const orgId = org;
    const as = o.as ?? null;
    const data = await withRole(o.db, as, async (sql) => {
      // E8в: exporting the ledger is the capability ledger.export of the team's role (owner and worker have it)
      if (as !== null && (await sql.query<{ ok: boolean }>("select private.has_cap($1::uuid, 'ledger.export') as ok", [orgId])).rows[0]?.ok !== true) return null;
      const rows = await readLedgerOnline(sql, orgId);
      const inSel = "task" in selection ? "t.id = $2" : "t.created_at >= $2::timestamptz and t.created_at < $3::timestamptz";
      const p = "task" in selection ? [orgId, selection.task] : [orgId, selection.from, selection.to];
      const tasks = (await sql.query<Record<string, unknown>>(`select t.id, t.type, t.agent, t.state, t.attempt, t.created_by::text as created_by, t.created_at from public.tasks t where t.org_id = $1::uuid and ${inSel} order by t.created_at, t.id`, p)).rows;
      const vSel = "task" in selection ? "v.task_id = $2" : "v.created_at >= $2::timestamptz and v.created_at < $3::timestamptz";
      const verdicts = (await sql.query<Record<string, unknown>>(`select v.task_id, v.run_id, v.attempt, v.result, v.verdict_hash, v.created_at from public.verdicts v where v.org_id = $1::uuid and ${vSel} order by v.created_at, v.run_id`, p)).rows;
      const aSel = "task" in selection ? "c.task_id = $2" : "a.decided_at >= $2::timestamptz and a.decided_at < $3::timestamptz";
      const approvals = (await sql.query<Record<string, unknown>>(`select a.id::text as id, c.task_id, a.changeset_id::text as changeset_id, a.user_id::text as user_id, a.decision, a.method, a.decided_at from public.approvals a join public.changesets c on c.id = a.changeset_id where a.org_id = $1::uuid and ${aSel} order by a.decided_at, a.id`, p)).rows;
      return { rows, tasks, verdicts, approvals };
    });
    if (data === null) {
      io.stderr(`not allowed: ledger.export in org ${orgId} for user ${o.as ?? ""}\n`);
      return 4;
    }
    const iso = (v: unknown): unknown => (v instanceof Date ? v.toISOString() : v);
    const plain = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, iso(v)]));
    const x = buildAuditExport({
      org: orgId,
      selection,
      rows: data.rows,
      records: { tasks: data.tasks.map(plain), verdicts: data.verdicts.map((v) => AuditVerdict.parse(plain(v))), approvals: data.approvals.map(plain) },
      generatedAt: (o.now?.() ?? new Date()).toISOString(),
      generatedBy: as ?? "cli",
    });
    const check = verifyAuditExport(x);
    if (!check.ok) {
      io.stderr(`the ledger does not verify (${check.code} at seq ${check.firstBadSeq ?? "?"}); nothing written — run mandat verify-log --org ${orgId}\n`);
      return 1;
    }
    const text = JSON.stringify(x, null, 2) + "\n";
    const out = o.out ?? `audit-${orgId.slice(0, 8)}-${"task" in selection ? selection.task : `${selection.from.slice(0, 10)}_${selection.to.slice(0, 10)}`}.json`;
    const file = path.resolve(io.cwd, out);
    writeFileSync(file, text, { mode: 0o600 });
    const sha = `sha256:${createHash("sha256").update(text).digest("hex")}`;
    // the export itself goes into the team's chain: who, what, which head, which file
    await appendLedgerOnline(o.db, { org_id: orgId, kind: "audit_export", task_id: null, payload: { by: as ?? "cli", selection, last_seq: check.count, included: check.included, export_sha256: sha } });
    if (o.json) {
      printJson(io, { ok: true, file: out, org: orgId, rows: check.count, included: check.included, verdicts: check.verdicts, sha256: sha });
      return 0;
    }
    io.stdout(`audit export → ${displayPath(io, file)} · org ${orgId.slice(0, 8)}… · ledger 1..${check.count} · ${check.included} included · ${check.verdicts} verdict${check.verdicts === 1 ? "" : "s"}\n`);
    io.stdout(`check it anywhere: mandat verify-log --audit ${displayPath(io, file)}\n`);
    return 0;
  } finally {
    await o.db.end?.();
  }
}

/** `mandat verify-log --audit <file>`: offline, no database. 0 ok, 1 tampered / not an export, 3 missing. */
export function verifyAuditFile(io: Io, o: { file: string; json: boolean }): number {
  const file = path.resolve(io.cwd, o.file);
  if (!existsSync(file)) {
    io.stderr(`audit file not found: ${o.file}\n`);
    return 3;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    raw = null;
  }
  const r = verifyAuditExport(raw);
  if (o.json) {
    printJson(io, r);
    return r.ok ? 0 : 1;
  }
  const head = raw !== null && typeof raw === "object" ? (raw as { org_id?: unknown }).org_id : undefined;
  if (r.ok) {
    io.stdout(`audit ${displayPath(io, file)} · org ${String(head)} · ${r.count} rows · ${r.included} included · ${r.verdicts} verdict${r.verdicts === 1 ? "" : "s"}\n`);
    io.stdout(r.count === 0 ? "OK: empty ledger\n" : `OK: chain intact (seq 1..${r.count}, last ${shortHash(r.lastHash ?? "")}); payloads and verdicts match\n`);
    return 0;
  }
  io.stdout(`audit ${displayPath(io, file)}\n`);
  io.stdout(`TAMPERED: seq ${r.firstBadSeq ?? "-"} ${r.code} — ${r.message}\n`);
  return 1;
}
