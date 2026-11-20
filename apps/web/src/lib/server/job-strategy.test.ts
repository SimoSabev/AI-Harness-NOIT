import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ORG_ID, DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { jobView } from "./job";
import { asService } from "./sql";
import { webDb } from "./web-db.test-helper";

// D-558 (demo 4.12): the page shows how the job was planned and who does what — the profile, one writer or waves, the
// pilot, the model per role, why — each unit's wave and its own copy (its task, attempt and state), and the gates of the
// final check with their status. Statuses, ids and counts only; never a test.
let db: Awaited<ReturnType<typeof webDb>>;
beforeAll(async () => {
  db = await webDb();
  const axes = { code: "existing", reference: "none", divisible: "yes", proof: ["tests"], risk: { level: "low", outward: false }, size: "l" };
  await asService(db, async (sql) => {
    await sql.query("insert into public.conversations (id, org_id, repo_id, agent, budget_usd, expires_at, status, axes, profile) values ('c_strat', $1::uuid, $2::uuid, 'claude', 0.5, now() + interval '1 hour', 'idle', $3::jsonb, 'feature')", [DEMO_ORG_ID, DEMO_REPO_ID, JSON.stringify(axes)]);
    await sql.query("insert into public.jobs (id, org_id, repo_id, conversation_id, spec_hash, oracle_hash, type, agent, model, status, mode, pilot_state, roles, playbook) values ('j_strat', $1::uuid, $2::uuid, 'c_strat', $3, $3, 'free', 'claude', 'sonnet', 'running', 'waves', 'running', $4::jsonb, null)", [DEMO_ORG_ID, DEMO_REPO_ID, `sha256:${"a".repeat(64)}`, JSON.stringify({ planner: { agent: "claude", model: "opus" } })]);
    await sql.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state, attempt) values ('t_strat_1', $1::uuid, $2::uuid, 'free', 'claude', 'x', 'RUNNING', 2)", [DEMO_ORG_ID, DEMO_REPO_ID]);
    for (const [k, u] of [["u1", []], ["u2", []], ["u3", ["u1"]]].entries()) {
      await sql.query("insert into public.job_units (job_id, unit_id, org_id, ord, title, criteria, depends_on, status, task_id, pilot) values ('j_strat', $1, $2::uuid, $3, $4, '[\"AC-1\"]'::jsonb, $5::jsonb, $6, $7, $8)", [u[0], DEMO_ORG_ID, k, `unit ${String(u[0])}`, JSON.stringify(u[1]), k === 0 ? "running" : "pending", k === 0 ? "t_strat_1" : null, k < 2]);
    }
  });
});
afterAll(async () => db.end());

describe("the job's strategy on the page (D-558)", () => {
  it("profile, waves, pilot, roles and why; each unit's wave and copy; every gate pending before the final check", async () => {
    const v = await asService(db, (sql) => jobView(sql, "c_strat", null));
    expect(v?.strategy).toMatchObject({ profile: "feature", mode: "waves", waves: 2, pilot: { units: 2, state: "running" } });
    expect(v?.strategy.roles).toEqual([
      { role: "planner", agent: "claude", model: "opus" },
      { role: "writer", agent: "claude", model: "sonnet" },
      { role: "advisor", agent: "claude", model: "sonnet" },
    ]);
    expect(v?.strategy.reasons).toEqual(["job.why.waves", "job.why.pilot", "job.why.baseline", "job.why.hidden", "job.why.fresh"]);
    expect(v?.units.map((u) => [u.id, u.wave, u.pilot])).toEqual([["u1", 0, true], ["u2", 0, true], ["u3", 1, false]]);
    expect(v?.units[0]?.copy).toEqual({ task: "t_strat_1", attempt: 2, state: "RUNNING" });
    expect(v?.units[2]?.copy).toBeNull();
    expect(v?.gates.every((g) => g.status === "pending")).toBe(true);
  });
});
