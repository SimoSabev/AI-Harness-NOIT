import pg from "pg";
import e2eSetup from "../e2e/global-setup";
import { E2E_DB } from "../playwright.config";

// The e2e seed + the scene state (spec т. 9.2–9.4): scene 1 seed near the threshold; scene 2 after the spill; scene 3 FAILED.
export default async function demoSetup(): Promise<void> {
  await e2eSetup();
  const c = new pg.Client({ connectionString: E2E_DB });
  await c.connect();
  const org = "d0000000-0000-4000-8000-000000000001";
  const repo = "d0000000-0000-4000-8000-0000000000b1";
  // scene 1: (shop, bugfix, claude) level 1, s_up 4.95 — one success away from level 2
  await c.query("update public.ladder_state set level = 1, s_up = 4.95, s_down = 0, pinned = false where repo_id = $1 and task_type = 'bugfix' and agent = 'claude'", [repo]);
  // scene 2: the limit on anthropic-key-demo and the spilled task on Codex (attempt 2, level 0, branch)
  await c.query("update public.model_channels set health = 'limited', last_error = '429', limit_resets_at = now() + interval '2 hours', cooldown_until = now() + interval '2 hours' where label = 'anthropic-key-demo'");
  await c.query(`insert into public.tasks (id, org_id, repo_id, type, agent, text, state, wait_reason, usd, minutes, effective_level, last_result, attempt, retry_reason, spills, channel_id)
    select 't_scene2', $1, $2, 'bugfix', 'codex', 'Поправи прага на отстъпката (сцена 2)', 'HELD', 'approval', 0.02, 1.1, 0, 'VERIFIED', 2, 'channel', 1, id from public.model_channels where label = 'openai-key-demo'`, [org, repo]);
  await c.query(`insert into public.changesets (org_id, task_id, attempt, base_sha, tree_sha, integrity, effective_level, approval_needed, head_sha, risk_class) values ($1, 't_scene2', 2, repeat('a', 40), repeat('e', 40), 'ok', 0, true, repeat('7', 40), 'low')`, [org]);
  await c.query("insert into public.deliveries (org_id, changeset_id, level, kind, ref, head_sha) select $1, id, 0, 'branch_only', 'mandat/t_scene2-a2', repeat('7', 40) from public.changesets where task_id = 't_scene2'", [org]);
  await c.end();
}
