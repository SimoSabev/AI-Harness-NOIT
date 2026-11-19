import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ORG_ID, DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { translate } from "../../i18n/t";
import type { Key, Params } from "../../i18n/t";
import { taskTitle } from "../task-title";
import { board } from "./queries";
import { asService } from "./sql";
import { U, webDb } from "./web-db.test-helper";

// D-538: the list rows carry what a short title of an internal task needs (role, unit, the spec's goal), read under RLS.
let db: Awaited<ReturnType<typeof webDb>>;
const H = `sha256:${"a".repeat(64)}`;
const spec = { goal: "Vector math for the engine", criteria: [], unchanged: [], out_of_scope: [], product: "" };
beforeAll(async () => {
  db = await webDb();
  await asService(db, async (sql) => {
    await sql.query("insert into public.conversations (id, org_id, repo_id, agent, budget_usd, expires_at, status, approved_spec, approved_spec_hash, approved_at) values ('c_tt', $1, $2, 'claude', 0.5, now() + interval '1 hour', 'idle', $3::jsonb, $4, now())", [DEMO_ORG_ID, DEMO_REPO_ID, JSON.stringify(spec), H]);
    const task = (id: string, text: string, extra: string, vals: string) => sql.query(`insert into public.tasks (id, org_id, repo_id, type, agent, text${extra}) values ($1, $2, $3, 'feature', 'claude', $4${vals})`, [id, DEMO_ORG_ID, DEMO_REPO_ID, text]);
    await task("t_tt_oracle", "Write hidden acceptance tests for the spec below. Do not implement anything.", ", kind", ", 'oracle'");
    await sql.query("insert into public.oracles (id, org_id, repo_id, conversation_id, spec_hash, task_id) values ('o_tt', $1, $2, 'c_tt', $3, 't_tt_oracle')", [DEMO_ORG_ID, DEMO_REPO_ID, H]);
    await sql.query("insert into public.jobs (id, org_id, repo_id, conversation_id, spec_hash, oracle_hash, type, agent) values ('j_tt', $1, $2, 'c_tt', $3, $3, 'feature', 'claude')", [DEMO_ORG_ID, DEMO_REPO_ID, H]);
    await sql.query("insert into public.job_units (job_id, unit_id, org_id, ord, title, criteria) values ('j_tt', 'u2', $1, 2, 'Vector length and distance', '[\"AC-2\"]'::jsonb)", [DEMO_ORG_ID]);
    await task("t_tt_unit", "You build one unit of a larger job. Goal of the job: Vector math", ", job_id, unit_id, job_role", ", 'j_tt', 'u2', 'unit'");
    await task("t_tt_final", "Final check of job j_tt: the whole change against the full oracle.", ", job_id, job_role", ", 'j_tt', 'final'");
  });
});
afterAll(async () => db.end());

describe("internal task rows (D-538)", () => {
  it("a viewer's list has short titles for the oracle, the unit and the final check; ordinary tasks keep their text", async () => {
    const rows = (await board(db, U.viewer, DEMO_ORG_ID)).columns.flatMap((c) => c.items);
    const en = (k: Key, p?: Params) => translate("en", k, p);
    const title = (id: string) => {
      const r = rows.find((x) => x.id === id);
      return r ? taskTitle(r, en) : null;
    };
    expect(title("t_tt_oracle")).toBe("Oracle · Vector math for the engine");
    expect(title("t_tt_unit")).toBe("Unit u2 · Vector length and distance");
    expect(title("t_tt_final")).toBe("Final check · Vector math for the engine");
    const seed = rows.find((x) => x.id === "t_seed_bugfix");
    expect(seed && taskTitle(seed, en)).toBe(seed?.text);
  });
});
