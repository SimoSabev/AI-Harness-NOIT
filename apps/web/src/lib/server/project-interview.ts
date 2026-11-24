import { ProjectApproveBody, ProjectBrief, jcs, projectBriefHash, projectBriefMissing, sha256Tag } from "@mandat/contract";
import type { Result } from "./actions";
import { hasCap } from "./roles";
import { asService } from "./sql";
import type { Db } from "./sql";

// D-557 (demo 4.12): the interview of a whole project. The worker keeps the brief the model proposed on the
// conversation; only a person with approve.level1 on the project approves it, by the hash they saw. The repo keeps the
// approved brief and its hash; later task conversations of the project start from it. The ledger row has the hash,
// never the brief's text.

const err = (status: number, error: string): Result => ({ status, body: { error } });

interface Row { purpose: string; status: string; repo: string | null; brief: unknown; hash: string | null; ready: boolean }

export async function approveProject(db: Db, o: { uid: string; org: string; id: string; body: unknown }): Promise<Result> {
  const b = ProjectApproveBody.safeParse(o.body);
  if (!b.success) return err(400, "bad_body");
  const c = (await asService(db, (sql) => sql.query<Row>("select purpose, status, repo_id::text as repo, project_brief as brief, project_brief_hash as hash, project_ready as ready from public.conversations where id = $1 and org_id = $2::uuid", [o.id, o.org]))).rows[0];
  if (!c) return err(404, "unknown_conversation");
  if (c.purpose !== "project" || !c.repo) return err(409, "not_a_project_interview");
  if (!(await hasCap(db, o.uid, o.org, "approve.level1", { repo: c.repo }))) return err(403, "not_an_approver");
  if (c.status === "queued" || c.status === "running") return err(409, "answering");
  const brief = ProjectBrief.safeParse(c.brief);
  // the stored hash must be the brief's own hash, nothing may be missing, and it must be the one the person saw
  if (!brief.success || c.hash !== projectBriefHash(brief.data) || !c.ready || projectBriefMissing(brief.data).length > 0) return err(409, "brief_not_ready");
  if (b.data.brief_hash !== c.hash) return err(409, "brief_changed");
  const hash = c.hash;
  const repo = c.repo;
  await asService(db, async (sql) => {
    await sql.query("update public.repos set brief = $2::jsonb, brief_hash = $3, brief_approved_by = $4::uuid, brief_approved_at = now() where id = $1::uuid and org_id = $5::uuid", [repo, JSON.stringify(brief.data), hash, o.uid, o.org]);
    const text = jcs({ conversation: o.id, repo, brief_hash: hash, by: o.uid });
    await sql.query("select private.ledger_append($1::uuid, 'project_approved', null, $2, $3)", [o.org, text, sha256Tag(text)]);
    // D-601: the approved brief goes into the project's profile — the harness proposes a new version from it (a person
    // approves that one with TOTP, like every profile)
    await sql.query("insert into public.outbox (org_id, kind, idempotency_key, payload) values ($1::uuid, 'harness_scan', $2, $3::jsonb) on conflict (idempotency_key) do nothing", [o.org, `scan:brief:${repo}:${hash}`, JSON.stringify({ repo_id: repo })]);
  });
  return { status: 200, body: { id: o.id, brief_hash: hash } };
}
