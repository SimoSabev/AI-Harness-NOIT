import { randomBytes } from "node:crypto";
import { ResearchReport, ResearchRequest } from "@mandat/contract";
import type { Db } from "@mandat/worker";

type SqlClient = Pick<Db, "query">;
import type { QueueSide } from "./backend.js";

// E9г (D-401): research_ask / research_recall over the harness database — the same queue the web uses; the worker runs it.
export function dbQueue(db: SqlClient, org: string): QueueSide {
  return {
    async enqueue(i) {
      const req = ResearchRequest.parse({ question: i.question, depth: i.depth, goal: "balanced", budget_usd: i.budget_usd, repo: i.repo });
      const id = `q_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
      await db.query("insert into public.research_questions (id, org_id, question, request, depth, goal, requested_by) values ($1, $2::uuid, $3, $4::jsonb, $5, $6, 'agent')", [id, org, req.question, JSON.stringify(req), req.depth, req.goal]);
      return id;
    },
    async poll(id) {
      const r = (await db.query<{ status: string; report: unknown; error: string | null }>("select status, report, error from public.research_questions where id = $1 and org_id = $2::uuid", [id, org])).rows[0];
      if (!r) return null;
      const p = r.report ? ResearchReport.safeParse(r.report) : null;
      return { status: r.status, report: p?.success ? p.data : null, error: r.error };
    },
    async recall(i) {
      const words = `${i.question ?? ""} ${i.topic ?? ""}`.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.slice(0, 8) ?? [];
      if (words.length === 0) return [];
      const r = await db.query<{ id: string; question: string; finished_at: string; report: unknown; hits: number }>(
        `select id, question, to_char(finished_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as finished_at, report,
                (select count(*)::int from unnest($3::text[]) w where lower(q.question) like '%' || w || '%') as hits
           from public.research_questions q
          where org_id = $1::uuid and report is not null and status in ('done', 'partial') and (request ->> 'repo' is null or request ->> 'repo' = $2)
          order by hits desc, finished_at desc limit 20`,
        [org, i.repo, words],
      );
      return r.rows
        .filter((x) => x.hits >= Math.max(1, Math.ceil(words.length / 2)))
        .flatMap((x) => {
          const p = ResearchReport.safeParse(x.report);
          return p.success ? [{ id: x.id, question: x.question, finished_at: x.finished_at, report: p.data }] : [];
        });
    },
  };
}
