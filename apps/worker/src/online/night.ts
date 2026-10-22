import { appendLedgerOnline } from "@mandat/ledger";
import type { SqlClient } from "@mandat/ledger";
import { NightRules } from "@mandat/contract";
import { afterVerdict, nightReport, proposalFor, whatStopped } from "./night-rules.js";
import type { NightVerdict } from "./night-rules.js";
import { enqueueOutbox } from "./pg-outbox.js";

// v5 E9а (5.1, D-320): the tick of the night shift (every 30 s in the daemon). A planned shift starts at starts_at; at
// most `slots` of its tasks run at once (each a normal task with shift_id, claimed by the daemon like any other); a
// finished task becomes merged / waiting, a new attempt with a note from Mandat, or parked with a question — and the
// next queued task starts in the same tick. Only the budget stops the queue early; ends_at lets the running tasks
// finish and closes the shift with a report, a push and a ledger row.
export interface NightTick { started: string[]; parked: string[]; done: string[] }

/** task states that are still in the daemon's hands */
const ACTIVE = new Set(["CREATED", "CONTRACTED", "PROVISIONING", "RUNNING", "EXPORTING", "RETRY", "VERIFY_1", "REBASING", "PUSHED", "VERIFY_2", "VERDICT"]);
/** a HELD that is only an approval of a verified change is "waiting"; any other HELD needs a person → park */
const APPROVAL_WAITS = new Set(["approval", "approval_2fa", "second_factor", null]);

interface Item { id: string; position: number; status: string; task_id: string | null; text: string; type: string; repo_id: string }
interface TaskRow { id: string; state: string; attempt: number; last_result: NightVerdict["result"] | null; wait_reason: string | null; effective_level: number | null; usd: string }

export async function nightShiftTick(db: SqlClient, o: { now: Date; slots?: number; agent?: string }): Promise<NightTick> {
  const out: NightTick = { started: [], parked: [], done: [] };
  const now = o.now.toISOString();
  const slots = Math.max(1, o.slots ?? 2);
  for (const s of (await db.query<{ id: string; org_id: string }>("update public.night_shifts set status = 'running' where status = 'planned' and starts_at <= $1 returning id::text as id, org_id::text as org_id", [now])).rows) {
    await appendLedgerOnline(db, { org_id: s.org_id, kind: "night_start", task_id: null, payload: { shift_id: s.id } });
    out.started.push(s.id);
  }
  const shifts = (await db.query<{ id: string; org_id: string; ends_at: string; budget_usd: string; rules: unknown }>("select id::text as id, org_id::text as org_id, ends_at::text as ends_at, budget_usd::text as budget_usd, rules from public.night_shifts where status = 'running' order by starts_at")).rows;
  for (const s of shifts) {
    const rules = NightRules.parse(s.rules);
    const items = (await db.query<Item>("select id::text as id, position, status, task_id, text, type, repo_id::text as repo_id from public.night_queue where shift_id = $1::uuid order by position", [s.id])).rows;
    // 1) the finished tasks of running items
    for (const it of items.filter((i) => i.status === "running" && i.task_id !== null)) {
      const t = (await db.query<TaskRow>("select id, state, attempt, last_result, wait_reason, effective_level, usd::text as usd from public.tasks where id = $1", [it.task_id])).rows[0];
      if (!t || ACTIVE.has(t.state) || t.last_result === null) continue;
      const verdict = await lastVerdict(db, t.id, t.attempt, t.last_result);
      const waitsForApproval = t.state === "HELD" && APPROVAL_WAITS.has(t.wait_reason) && t.last_result === "VERIFIED";
      if (t.state === "CLOSED" && t.last_result === "VERIFIED") it.status = await setItem(db, it.id, "merged");
      else if ((t.state === "GATED" || t.state === "DELIVERED" || waitsForApproval) && t.last_result === "VERIFIED") it.status = await setItem(db, it.id, "waiting");
      else {
        // a verified change is classified by its state above; here only failures and HELDs that need a person remain
        // (auto_merge's level and line rule is applied by the daemon at delivery, where the diff is)
        const next = afterVerdict(t.state === "HELD" && t.last_result === "VERIFIED" ? { result: "UNKNOWN", reasons: [`HELD:${t.wait_reason ?? "held"}`] } : verdict, { attempt: t.attempt, level: t.effective_level ?? 0, lines: 0 }, rules);
        if (next.action === "retry") await retry(db, s.org_id, t, verdict);
        else if (next.action === "park") {
          it.status = await setItem(db, it.id, "parked");
          await park(db, s.org_id, s.id, t, verdict);
          out.parked.push(t.id);
        } else it.status = await setItem(db, it.id, next.status);
      }
    }
    // 2) the budget: what is spent on the shift's tasks
    const spent = Number((await db.query<{ usd: string }>("select coalesce(sum(usd), 0)::text as usd from public.tasks where shift_id = $1::uuid", [s.id])).rows[0]?.usd ?? 0);
    await db.query("update public.night_shifts set spent_usd = $2 where id = $1::uuid", [s.id, Math.round(spent * 100) / 100]);
    const overBudget = spent >= Number(s.budget_usd);
    const overTime = Date.parse(s.ends_at) <= o.now.getTime();
    if (overBudget || overTime) {
      for (const it of items.filter((i) => i.status === "queued")) it.status = await setItem(db, it.id, "skipped", overBudget ? "budget" : "time");
    }
    // 3) fill the free slots (the next task starts in the same tick as a park)
    let running = items.filter((i) => i.status === "running").length;
    for (const it of items.filter((i) => i.status === "queued")) {
      if (running >= slots) break;
      const taskId = `t_night_${it.id}`;
      await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, shift_id) values ($1, $2::uuid, $3::uuid, $4, $5, $6, $7::uuid) on conflict (id) do nothing", [taskId, s.org_id, it.repo_id, it.type, o.agent ?? "claude", it.text, s.id]);
      await db.query("update public.night_queue set status = 'running', task_id = $2 where id = $1::bigint and status = 'queued'", [it.id, taskId]);
      it.status = "running";
      running++;
    }
    // 4) the end: nothing running and (time, budget or an empty queue) → the report
    if (running === 0 && !items.some((i) => i.status === "queued")) {
      const learned = (await db.query<{ proposal: string }>("select proposal from public.night_questions where shift_id = $1::uuid order by created_at limit 20", [s.id])).rows.map((r) => r.proposal);
      const report = nightReport(items, spent, learned);
      const r = await db.query("update public.night_shifts set status = 'done', report = $2::jsonb where id = $1::uuid and status = 'running' returning id", [s.id, JSON.stringify(report)]);
      if (r.rows.length === 0) continue;
      await appendLedgerOnline(db, { org_id: s.org_id, kind: "night_done", task_id: null, payload: { shift_id: s.id, ...report } });
      await enqueueOutbox(db, { org_id: s.org_id, kind: "web_push", idempotency_key: `push:night:${s.id}`, payload: { shift_id: s.id, kind: "night_report" } });
      out.done.push(s.id);
    }
  }
  return out;
}

async function setItem(db: SqlClient, id: string, status: string, note: string | null = null): Promise<string> {
  await db.query("update public.night_queue set status = $2, note = $3 where id = $1::bigint", [id, status, note]);
  return status;
}

async function lastVerdict(db: SqlClient, task: string, attempt: number, result: NightVerdict["result"]): Promise<NightVerdict> {
  const v = (await db.query<{ result: NightVerdict["result"]; reasons: unknown }>("select result, reasons from public.verdicts where task_id = $1 and attempt = $2 order by created_at desc limit 1", [task, attempt])).rows[0];
  const reasons = Array.isArray(v?.reasons) ? v.reasons.filter((r): r is string => typeof r === "string") : [];
  return { result: v?.result ?? result, reasons };
}

/** a new attempt with Mandat's note (what stopped the last one and the proposal by class); the daemon claims it */
async function retry(db: SqlClient, org: string, t: TaskRow, v: NightVerdict): Promise<void> {
  const note = `${whatStopped(v, t.attempt)}. ${proposalFor(v.reasons)}`.slice(0, 500);
  await db.query("insert into public.task_activities (org_id, task_id, kind, text) values ($1::uuid, $2, 'night', $3)", [org, t.id, note]);
  await db.query("update public.tasks set attempt = attempt + 1, retry_reason = 'night', state = 'CREATED', wait_reason = null, state_entered_at = now(), updated_at = now(), seq = seq + 1 where id = $1", [t.id]);
  await appendLedgerOnline(db, { org_id: org, kind: "task_retry", task_id: t.id, payload: { attempt: t.attempt + 1, reason: "night", after: v.result } });
}

/** parked: the branch with the partial work stays; a question in human words; the shift goes on */
async function park(db: SqlClient, org: string, shift: string, t: TaskRow, v: NightVerdict): Promise<void> {
  const attempts = (await db.query<{ attempt: number; result: string }>("select attempt, result from public.verdicts where task_id = $1 order by attempt, created_at", [t.id])).rows;
  const tried = [...new Map(attempts.map((a) => [a.attempt, `attempt ${a.attempt}: ${a.result}`])).values()].slice(0, 10);
  await db.query(
    "insert into public.night_questions (org_id, shift_id, task_id, what_stopped, tried, proposal) values ($1::uuid, $2::uuid, $3, $4, $5::jsonb, $6) on conflict (shift_id, task_id) do nothing",
    [org, shift, t.id, whatStopped(v, t.attempt), JSON.stringify(tried), proposalFor(v.reasons)],
  );
  await appendLedgerOnline(db, { org_id: org, kind: "parked", task_id: t.id, payload: { shift_id: shift, attempt: t.attempt, result: v.result, reasons: v.reasons.slice(0, 20) } });
}
