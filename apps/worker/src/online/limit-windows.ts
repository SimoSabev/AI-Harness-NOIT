import type { LimitWindow } from "@mandat/contract";
import { appendLedgerOnline } from "@mandat/ledger";
import type { SqlClient } from "@mandat/ledger";

// D-647: a conversation on a subscription reports its windows (5 h, week, …) like a task does. The ledger row is in the
// conversation's org, with no task; only the agent, the time and the numbers — never a word of the conversation.
export async function recordChatWindows(db: SqlClient, o: { conversation: string; agent: string; windows: LimitWindow[]; at: string }): Promise<void> {
  const org = (await db.query<{ org: string }>("select org_id::text as org from public.conversations where id = $1", [o.conversation])).rows[0]?.org;
  if (!org) return;
  await appendLedgerOnline(db, { org_id: org, kind: "limit_windows", task_id: null, payload: { agent: o.agent, at: o.at, windows: o.windows.slice(0, 8) } });
}
