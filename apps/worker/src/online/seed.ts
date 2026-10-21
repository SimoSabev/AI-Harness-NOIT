import { randomBytes } from "node:crypto";
import type { SqlClient } from "@mandat/ledger";
import { appendLedgerOnline } from "@mandat/ledger";

// Демо промпт т. 5.1 (S28): `mandat demo seed --minimal` = demo org + owner (+ the shop repo), no UI data.
// Fixed ids so the seed is idempotent; the full seed (ladder, 4 accounts) is E3а.
export const DEMO_ORG_ID = "d0000000-0000-4000-8000-000000000001";
export const DEMO_OWNER_ID = "d0000000-0000-4000-8000-0000000000a1";
export const DEMO_REPO_ID = "d0000000-0000-4000-8000-0000000000b1";

export async function seedMinimal(db: SqlClient, o: { remoteUrl: string; ownerEmail?: string }): Promise<{ org: string; owner: string; repo: string; created: boolean }> {
  const exists = await db.query<{ n: number }>("select count(*)::int as n from public.orgs where id = $1", [DEMO_ORG_ID]);
  if ((exists.rows[0]?.n ?? 0) > 0) return { org: DEMO_ORG_ID, owner: DEMO_OWNER_ID, repo: DEMO_REPO_ID, created: false };
  await db.query("insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing", [DEMO_OWNER_ID, o.ownerEmail ?? "owner@demo.mandat.invalid"]);
  await db.query("insert into public.orgs (id, name, is_demo) values ($1, 'Mandat demo', true)", [DEMO_ORG_ID]);
  await db.query("insert into public.members (org_id, user_id, role) values ($1, $2, 'owner')", [DEMO_ORG_ID, DEMO_OWNER_ID]);
  await db.query("insert into public.repos (id, org_id, provider, full_name, remote_url, default_branch) values ($1, $2, 'local', 'mandat-demo/shop', $3, 'main')", [DEMO_REPO_ID, DEMO_ORG_ID, o.remoteUrl]);
  await appendLedgerOnline(db, { org_id: DEMO_ORG_ID, kind: "demo_reset", task_id: null, payload: { seed: "minimal", repo: "mandat-demo/shop" } });
  return { org: DEMO_ORG_ID, owner: DEMO_OWNER_ID, repo: DEMO_REPO_ID, created: true };
}

export const LOCAL_EMAIL = "ti@mandat.local";

/**
 * D-292 (`pnpm local`): one owner with a password, the 4 task types, the 2 channels, no cards, no TOTP, ladder level 0.
 * Called on every start: a fresh password each time (printed once to the terminal, stored only as a bcrypt hash).
 */
export async function seedLocal(db: SqlClient, o: { remoteUrl: string; password: string }): Promise<{ org: string; email: string; created: boolean }> {
  const m = await seedMinimal(db, { remoteUrl: o.remoteUrl, ownerEmail: LOCAL_EMAIL });
  await db.query("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')), email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1", [DEMO_OWNER_ID, o.password]);
  await db.query("update public.repos set remote_url = $2 where id = $1", [DEMO_REPO_ID, o.remoteUrl]);
  for (const [name, risk] of [["bugfix", "low"], ["feature", "medium"], ["css", "low"], ["docs", "low"]] as const) {
    await db.query("insert into public.task_types (org_id, repo_id, name, risk_class) values ($1, $2, $3, $4) on conflict do nothing", [DEMO_ORG_ID, DEMO_REPO_ID, name, risk]);
  }
  await seedChannels(db); // D-293: claude → the Anthropic key, codex → the OpenAI key of the proxy
  return { org: DEMO_ORG_ID, email: LOCAL_EMAIL, created: m.created };
}

// Демо промпт т. 8 „Общо за E3“: org mandat-demo with 4 accounts, the ladder of agent claude (css=3 pinned, docs=2,
// feature=1, bugfix=0, simulated history), 3 inbox cards + a merged and a running task. Passwords and TOTP secrets are
// generated here and returned ONCE to the caller (the CLI prints them; never stored in the repo or the log).
export const DEMO_USERS = [
  { id: "d0000000-0000-4000-8000-0000000000a1", email: "owner@demo.mandat.invalid", role: "owner", totp: true },
  { id: "d0000000-0000-4000-8000-0000000000a2", email: "approver@demo.mandat.invalid", role: "approver", totp: true },
  { id: "d0000000-0000-4000-8000-0000000000a3", email: "viewer@demo.mandat.invalid", role: "viewer", totp: false },
  // D-286: members.role has no 'admin'; admin@demo is a second owner (spec т. 0 uses it for settings)
  { id: "d0000000-0000-4000-8000-0000000000a4", email: "admin@demo.mandat.invalid", role: "owner", totp: true },
] as const;

export interface DemoSecrets {
  email: string;
  role: string;
  password: string;
  totpSecret: string | null;
}

const sha = (c: string) => c.repeat(40);
const ago = (min: number) => `now() - interval '${min} minutes'`;

type Card = {
  id: string; type: string; agent: string; text: string; state: string; wait: string | null; result: "VERIFIED" | "FAILED" | null; level: number | null;
  approval: boolean; twoFactor: boolean; reasons: string[]; a: [number, number] | null; inv: [number, number] | null; usd: number; minutes: number; min: number; head: string; delivered: string | null; pr: number | null; outcomeDecided: boolean;
};
const CARDS: Card[] = [
  { id: "t_seed_feature", type: "feature", agent: "claude", text: "Добави код за отстъпка SAVE10 в количката", state: "GATED", wait: "approval", result: "VERIFIED", level: 1, approval: true, twoFactor: true, reasons: [], a: [20, 20], inv: [20, 21], usd: 0.31, minutes: 6.2, min: 50, head: "1", delivered: "draft_pr", pr: 11, outcomeDecided: false },
  { id: "t_seed_bugfix", type: "bugfix", agent: "claude", text: "Поправи закръглянето на ДДС в общата сума", state: "HELD", wait: "approval", result: "VERIFIED", level: 0, approval: true, twoFactor: false, reasons: [], a: [20, 20], inv: [20, 20], usd: 0.12, minutes: 3.4, min: 40, head: "2", delivered: "branch_only", pr: null, outcomeDecided: false },
  { id: "t_seed_failed", type: "bugfix", agent: "codex", text: "Направи теста за 10% отстъпка да минава", state: "BLOCKED", wait: "failed", result: "FAILED", level: 0, approval: false, twoFactor: false, reasons: ["D2:missing_test:tests/cart.spec.ts > cart > applies 10% over 50"], a: [20, 20], inv: [20, 19], usd: 0.09, minutes: 2.8, min: 30, head: "3", delivered: null, pr: null, outcomeDecided: false },
  { id: "t_seed_css", type: "css", agent: "claude", text: "Увеличи контраста на бутона „Купи“", state: "CLOSED", wait: null, result: "VERIFIED", level: 3, approval: false, twoFactor: false, reasons: [], a: [20, 20], inv: [20, 20], usd: 0.05, minutes: 1.9, min: 120, head: "4", delivered: "merge", pr: 9, outcomeDecided: true },
  { id: "t_seed_docs", type: "docs", agent: "claude", text: "Опиши кода за отстъпки в README", state: "RUNNING", wait: null, result: null, level: null, approval: false, twoFactor: false, reasons: [], a: null, inv: null, usd: 0.02, minutes: 0.7, min: 2, head: "5", delivered: null, pr: null, outcomeDecided: false },
];

const LADDER = [
  { type: "css", level: 3, s_up: 0, pinned: true },
  { type: "docs", level: 2, s_up: 2.2, pinned: false },
  { type: "feature", level: 1, s_up: 1.1, pinned: false },
  { type: "bugfix", level: 0, s_up: 0.6, pinned: false },
];

export async function seedDemo(db: SqlClient, o: { remoteUrl: string; password?: () => string; totpSecret?: () => string }): Promise<{ org: string; created: boolean; secrets: DemoSecrets[] }> {
  const exists = await db.query<{ n: number }>("select count(*)::int as n from public.task_types where repo_id = $1", [DEMO_REPO_ID]);
  if ((exists.rows[0]?.n ?? 0) > 0) return { org: DEMO_ORG_ID, created: false, secrets: [] };
  await seedMinimal(db, { remoteUrl: o.remoteUrl, ownerEmail: DEMO_USERS[0].email });
  await db.query("update public.orgs set name = 'mandat-demo' where id = $1", [DEMO_ORG_ID]);
  const secrets: DemoSecrets[] = [];
  for (const u of DEMO_USERS) {
    const password = (o.password ?? randomPassword)();
    await db.query(
      `insert into auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
       values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', extensions.crypt($3, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
       on conflict (id) do update set email = excluded.email, instance_id = excluded.instance_id, aud = excluded.aud, role = excluded.role, encrypted_password = excluded.encrypted_password,
         email_confirmed_at = excluded.email_confirmed_at, raw_app_meta_data = excluded.raw_app_meta_data, raw_user_meta_data = excluded.raw_user_meta_data, updated_at = now(),
         confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change = ''`,
      [u.id, u.email, password],
    );
    await db.query(
      "insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values ($1, $3::uuid, $2::jsonb, 'email', now(), now(), now()) on conflict (provider_id, provider) do nothing",
      [u.id, JSON.stringify({ sub: u.id, email: u.email, email_verified: true }), u.id],
    );
    await db.query("insert into public.members (org_id, user_id, role) values ($1, $2, $3) on conflict (org_id, user_id) do update set role = excluded.role", [DEMO_ORG_ID, u.id, u.role]);
    let totpSecret: string | null = null;
    if (u.totp && o.totpSecret) {
      totpSecret = o.totpSecret();
      await db.query("insert into private.dev_totp (user_id, secret_b32) values ($1, $2) on conflict (user_id) do update set secret_b32 = excluded.secret_b32", [u.id, totpSecret]);
    }
    secrets.push({ email: u.email, role: u.role, password, totpSecret });
  }
  for (const [name, risk] of [["bugfix", "low"], ["feature", "medium"], ["css", "low"], ["docs", "low"]] as const) {
    await db.query("insert into public.task_types (org_id, repo_id, name, risk_class) values ($1, $2, $3, $4)", [DEMO_ORG_ID, DEMO_REPO_ID, name, risk]);
  }
  for (const l of LADDER) {
    await db.query("insert into public.ladder_state (org_id, repo_id, task_type, agent, level, s_up, s_down, pinned) values ($1, $2, $3, 'claude', $4, $5, 0, $6)", [DEMO_ORG_ID, DEMO_REPO_ID, l.type, l.level, l.s_up, l.pinned]);
    // simulated history (UI label „симулирано“: input = 'seed')
    for (let lv = 0; lv < l.level; lv++) {
      await db.query(`insert into public.ladder_events (org_id, repo_id, task_type, agent, input, level_before, level_after, s_up, s_down, created_at) values ($1, $2, $3, 'claude', 'seed', $4, $5, 0, 0, ${ago((l.level - lv) * 60 * 24)})`, [DEMO_ORG_ID, DEMO_REPO_ID, l.type, lv, lv + 1]);
    }
  }
  await db.query("insert into public.ladder_state (org_id, repo_id, task_type, agent, level, s_up, s_down, pinned) values ($1, $2, 'bugfix', 'codex', 0, 0, 0, false)", [DEMO_ORG_ID, DEMO_REPO_ID]);
  await seedChannels(db);
  for (const c of CARDS) await seedCard(db, c);
  return { org: DEMO_ORG_ID, created: true, secrets };
}

/** Scene 1 (т. 9.2): only the key (shop, bugfix, claude) → level 1 with s_up = 4.95 (one success → level 2). */
export async function seedScene1(db: SqlClient): Promise<void> {
  await db.query("update public.ladder_state set level = 1, s_up = 4.95, s_down = 0, pinned = false, updated_at = now() where repo_id = $1 and task_type = 'bugfix' and agent = 'claude'", [DEMO_REPO_ID]);
  await db.query("insert into public.ladder_events (org_id, repo_id, task_type, agent, input, level_before, level_after, s_up, s_down) values ($1, $2, 'bugfix', 'claude', 'seed', 0, 1, 4.95, 0)", [DEMO_ORG_ID, DEMO_REPO_ID]);
}

async function seedCard(db: SqlClient, c: Card): Promise<void> {
  await db.query(
    `insert into public.tasks (id, org_id, repo_id, type, agent, text, state, wait_reason, usd, minutes, effective_level, last_result, outcome_decided, created_at, state_entered_at, updated_at, seq)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, ${ago(c.min + 10)}, ${ago(c.min)}, ${ago(c.min)}, 1)`,
    [c.id, DEMO_ORG_ID, DEMO_REPO_ID, c.type, c.agent, c.text, c.state, c.wait, c.usd, c.minutes, c.level, c.result, c.outcomeDecided],
  );
  await appendLedgerOnline(db, { org_id: DEMO_ORG_ID, kind: "task_created", task_id: c.id, payload: { task_id: c.id, agent: c.agent, seed: true } });
  if (!c.result) return;
  const cs = await db.query<{ id: string }>(
    "insert into public.changesets (org_id, task_id, base_sha, tree_sha, diff_hash, integrity, effective_level, requires_second_factor, approval_needed, head_sha, risk_class) values ($1, $2, $3, $4, $5, 'ok', $6, $7, $8, $9, 'low') returning id::text as id",
    [DEMO_ORG_ID, c.id, sha("a"), sha(c.head === "1" ? "b" : "e"), `sha256:${sha(c.head).slice(0, 40)}${"0".repeat(24)}`, c.level, c.twoFactor, c.approval, sha(c.head)],
  );
  const csId = cs.rows[0]?.id as string;
  await db.query("insert into public.changeset_diffs (changeset_id, org_id, diff) values ($1, $2, $3)", [csId, DEMO_ORG_ID, `diff --git a/src/cart.ts b/src/cart.ts\n--- a/src/cart.ts\n+++ b/src/cart.ts\n@@ -1,3 +1,3 @@\n-// seed: ${c.id}\n+// seed: ${c.id} (демо)\n`]);
  const run = `r_01J${c.head.repeat(23)}`.slice(0, 28).toUpperCase().replace(/^R_/, "r_");
  const v = await db.query<{ id: string }>(
    "insert into public.verdicts (org_id, task_id, changeset_id, run_id, attempt, mode, agent, result, reasons, base_sha, tree_sha, verdict_hash) values ($1, $2, $3, $4, 1, 'full', $5, $6, $7::jsonb, $8, $9, $10) returning id::text as id",
    [DEMO_ORG_ID, c.id, csId, run, c.agent, c.result, JSON.stringify(c.reasons), sha("a"), sha("e"), `sha256:${sha(c.head)}${sha(c.head).slice(0, 24)}`],
  );
  const vid = v.rows[0]?.id as string;
  const evid = (detector: string, status: string, summary: string, data: unknown, signature: string | null) =>
    db.query("insert into public.evidence (org_id, verdict_id, detector, phase, status, summary, data, source, signature) values ($1, $2, $3, 1, $4, $5, $6::jsonb, 'sandbox:verify', $7)", [DEMO_ORG_ID, vid, detector, status, summary, JSON.stringify(data), signature]);
  if (c.a) await evid("D1.base_tests", "pass", `${c.a[0]}/${c.a[1]}`, { passed: c.a[0], total: c.a[1] }, null);
  if (c.inv) await evid("D2.inventory", c.result === "FAILED" ? "fail" : "pass", `${c.inv[0]} → ${c.inv[1]}`, { before: c.inv[0], after: c.inv[1] }, c.reasons[0] ?? null);
  await appendLedgerOnline(db, { org_id: DEMO_ORG_ID, kind: "verdict", task_id: c.id, payload: { run_id: run, result: c.result, reasons: c.reasons, seed: true } });
  if (c.delivered) {
    await db.query("insert into public.deliveries (org_id, changeset_id, level, kind, pr_number, head_sha) values ($1, $2, $3, $4, $5, $6)", [DEMO_ORG_ID, csId, c.level ?? 0, c.delivered, c.pr, sha(c.head)]);
    await appendLedgerOnline(db, { org_id: DEMO_ORG_ID, kind: "delivered", task_id: c.id, payload: { kind: c.delivered, pr: c.pr, seed: true } });
  }
  if (c.outcomeDecided) await db.query("insert into public.outcomes (org_id, changeset_id, result, window_minutes, tree_match) values ($1, $2, 'success', 0, true)", [DEMO_ORG_ID, csId]);
  await db.query("insert into public.task_activities (org_id, task_id, kind, text) values ($1, $2, 'tool', 'edit src/cart.ts'), ($1, $2, 'tool', 'run pnpm test')", [DEMO_ORG_ID, c.id]);
}

function randomPassword(): string {
  return randomBytes(12).toString("base64url");
}

// E3в (сцена 2): two api_key channels (metadata only; the keys are in the proxy's env) + the rule for the demo repo:
// auto, fallback = openai-key-demo. A budget of 3 $/day per channel (MANDAT_DEMO_ORG_BUDGET_USD_DAY default).
export const DEMO_CHANNELS = { anthropic: "d0000000-0000-4000-8000-0000000000c1", openai: "d0000000-0000-4000-8000-0000000000c2" } as const;
export async function seedChannels(db: SqlClient, o: { openaiModel?: string } = {}): Promise<void> {
  await db.query(
    `insert into public.model_channels (id, org_id, label, provider, kind, model, budget_usd_day, quality, cost) values
       ($1, $3, 'anthropic-key-demo', 'anthropic', 'api_key', 'claude-sonnet-5-5', 3, 0.9, 0.6),
       ($2, $3, 'openai-key-demo', 'openai', 'api_key', $4, 3, 0.85, 0.5)
     on conflict (org_id, label) do nothing`,
    [DEMO_CHANNELS.anthropic, DEMO_CHANNELS.openai, DEMO_ORG_ID, o.openaiModel ?? "gpt-5-codex"],
  );
  await db.query(
    "insert into public.routing_rules (org_id, priority, match, channel_id, repo_id, mode, fallback_channel_ids) select $1, 1, '{}', $2, $3, 'auto', array[$4::uuid] where not exists (select 1 from public.routing_rules where org_id = $1 and repo_id = $3)",
    [DEMO_ORG_ID, DEMO_CHANNELS.anthropic, DEMO_REPO_ID, DEMO_CHANNELS.openai],
  );
}
