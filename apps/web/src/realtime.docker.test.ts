import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { realtimeBroadcaster } from "../../worker/src/online/daemon";

// Демо промпт т. 8.1 realtime.test: local Supabase; the worker's REST broadcast (httpSend path) → a member's private
// channel gets it ≤ 2 s; a member of another org does not (RLS on realtime.messages, S22). Keys come from
// `supabase status` inside this process and are never printed. Without the local stack: SKIPPED (D-276).
type Status = { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string; DB_URL: string };
function status(): Status | null {
  try {
    const s = JSON.parse(execFileSync("npx", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60_000 })) as Status;
    return s.API_URL && s.ANON_KEY && s.SERVICE_ROLE_KEY ? s : null;
  } catch {
    return null;
  }
}
const st = status();
const ids = { orgA: randomUUID(), orgB: randomUUID(), userA: randomUUID(), userB: randomUUID() };
const password = randomBytes(18).toString("base64url");
const email = (u: string) => `rt-${u.slice(0, 8)}@test.mandat.invalid`;
let db: pg.Client;

describe.skipIf(!st)("realtime (local Supabase)", () => {
  beforeAll(async () => {
    db = new pg.Client({ connectionString: (st as Status).DB_URL });
    await db.connect();
    for (const u of [ids.userA, ids.userB]) {
      await db.query(
        `insert into auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
         values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', extensions.crypt($3, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')`,
        [u, email(u), password],
      );
      await db.query("insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values ($1, $2::uuid, $3::jsonb, 'email', now(), now(), now())", [u, u, JSON.stringify({ sub: u, email: email(u), email_verified: true })]);
    }
    await db.query("insert into public.orgs (id, name) values ($1, 'rt-a'), ($2, 'rt-b')", [ids.orgA, ids.orgB]);
    await db.query("insert into public.members (org_id, user_id, role) values ($1, $2, 'viewer'), ($3, $4, 'viewer')", [ids.orgA, ids.userA, ids.orgB, ids.userB]);
  });
  afterAll(async () => {
    await db.query("delete from public.orgs where id in ($1, $2)", [ids.orgA, ids.orgB]);
    await db.query("delete from auth.users where id in ($1, $2)", [ids.userA, ids.userB]);
    await db.end();
  });

  async function listen(user: string, topic: string) {
    const s = st as Status;
    const sb = createClient(s.API_URL, s.ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.signInWithPassword({ email: email(user), password });
    if (error || !data.session) throw new Error(`login failed: ${error?.message ?? "?"}`);
    await sb.realtime.setAuth(data.session.access_token);
    const got: { at: number; payload: unknown }[] = [];
    const subscribed = await new Promise<string>((resolve) => {
      sb.channel(topic, { config: { private: true } })
        .on("broadcast", { event: "task" }, (m: { payload: unknown }) => got.push({ at: Date.now(), payload: m.payload }))
        .subscribe((state: string) => {
          if (state !== "JOINING") resolve(state);
        });
      setTimeout(() => resolve("TIMEOUT"), 10_000);
    });
    return { sb, got, subscribed };
  }

  it("worker broadcast → член на org получава ≤ 2 s; член на друг org не получава", async () => {
    const s = st as Status;
    const topic = `org:${ids.orgA}:board`;
    const a = await listen(ids.userA, topic);
    const b = await listen(ids.userB, topic);
    expect(a.subscribed).toBe("SUBSCRIBED");
    const t0 = Date.now();
    await realtimeBroadcaster({ url: s.API_URL, serviceKey: s.SERVICE_ROLE_KEY })(topic, "task", { task_id: "t_rt", seq: 1, state: "RUNNING" });
    for (let i = 0; i < 40 && a.got.length === 0; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 500));
    expect(a.got).toHaveLength(1);
    expect((a.got[0]?.at ?? Infinity) - t0).toBeLessThanOrEqual(2000);
    expect(a.got[0]?.payload).toMatchObject({ task_id: "t_rt", state: "RUNNING" });
    expect(b.got).toEqual([]);
    expect(b.subscribed).not.toBe("SUBSCRIBED");
    await a.sb.removeAllChannels();
    await b.sb.removeAllChannels();
  });
});
