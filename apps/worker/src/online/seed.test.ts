import { describe, expect, it } from "vitest";
import { readLedgerOnline, verifyOnlineRows } from "@mandat/ledger";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_USERS, LOCAL_EMAIL, seedDemo, seedLocal, seedScene1 } from "./seed.js";

describe("mandat demo seed (т. 8 „Общо за E3“)", () => {
  it("4 акаунта, стълбата на claude, 3 карти в inbox, дневникът е валиден; повторно → без нови тайни", async () => {
    const db = await pgliteDb();
    try {
      const r = await seedDemo(db, { remoteUrl: "file:///tmp/x", password: () => "pw-for-test-only", totpSecret: () => "A".repeat(32) });
      expect(r.created).toBe(true);
      expect(r.secrets.map((s) => [s.email, s.role, s.totpSecret !== null])).toEqual(DEMO_USERS.map((u) => [u.email, u.role, u.totp]));
      const login = await db.query<{ id: string }>("select id from auth.users where email = $1 and encrypted_password = extensions.crypt($2, encrypted_password)", [DEMO_USERS[1].email, "pw-for-test-only"]);
      expect(login.rows[0]?.id).toBe(DEMO_USERS[1].id);
      const lad = await db.query<{ task_type: string; level: number; pinned: boolean }>("select task_type, level, pinned from public.ladder_state where agent = 'claude' order by task_type");
      expect(lad.rows).toEqual([
        { task_type: "bugfix", level: 0, pinned: false },
        { task_type: "css", level: 3, pinned: true },
        { task_type: "docs", level: 2, pinned: false },
        { task_type: "feature", level: 1, pinned: false },
      ]);
      const inbox = await db.query<{ id: string }>("select id from public.tasks where state = 'HELD' or (state = 'GATED' and exists (select 1 from public.changesets c where c.task_id = tasks.id and c.approval_needed)) or (state = 'BLOCKED' and coalesce(wait_reason, '') <> 'stopped') order by id");
      expect(inbox.rows.map((x) => x.id)).toEqual(["t_seed_bugfix", "t_seed_failed", "t_seed_feature"]);
      expect(verifyOnlineRows(await readLedgerOnline(db, DEMO_ORG_ID), DEMO_ORG_ID).ok).toBe(true);
      expect((await seedDemo(db, { remoteUrl: "file:///tmp/x" })).secrets).toEqual([]);
      await seedScene1(db);
      const b = await db.query<{ level: number; s_up: number }>("select level, s_up from public.ladder_state where task_type = 'bugfix' and agent = 'claude'");
      expect(b.rows[0]).toEqual({ level: 1, s_up: 4.95 });
      const codex = await db.query<{ level: number }>("select level from public.ladder_state where task_type = 'bugfix' and agent = 'codex'");
      expect(codex.rows[0]?.level).toBe(0);
    } finally {
      await db.end();
    }
  });
});

describe("seedLocal (D-292: pnpm local)", () => {
  it("D-368: без парола и без TOTP — няма парола за вход, няма тайна", async () => {
    const db = await pgliteDb();
    try {
      expect(await seedLocal(db, { remoteUrl: "file:///tmp/x" })).toEqual({ org: DEMO_ORG_ID, email: LOCAL_EMAIL, created: true, totpSecret: null });
      expect((await db.query<{ p: string | null }>("select encrypted_password as p from auth.users where email = $1", [LOCAL_EMAIL])).rows[0]?.p ?? null).toBeNull();
      expect((await db.query<{ n: number }>("select count(*)::int as n from private.dev_totp")).rows[0]?.n).toBe(0);
    } finally {
      await db.end();
    }
  });
  it("един собственик с парола, 4 типа задачи, без карти; TOTP само първия път (D-297); повторно → само нова парола", async () => {
    const db = await pgliteDb();
    try {
      const a = await seedLocal(db, { remoteUrl: "file:///tmp/x", password: "first-pw-test", totpSecret: () => "B".repeat(32) });
      expect(a).toEqual({ org: DEMO_ORG_ID, email: LOCAL_EMAIL, created: true, totpSecret: "B".repeat(32) });
      const login = (pw: string) => db.query<{ id: string }>("select id from auth.users where email = $1 and encrypted_password = extensions.crypt($2, encrypted_password)", [LOCAL_EMAIL, pw]);
      expect((await login("first-pw-test")).rows.length).toBe(1);
      expect((await db.query<{ role: string }>("select role from public.members where org_id = $1", [DEMO_ORG_ID])).rows).toEqual([{ role: "owner" }]);
      expect((await db.query<{ name: string }>("select name from public.task_types order by name")).rows.map((r) => r.name)).toEqual(["bugfix", "css", "docs", "feature"]);
      expect((await db.query<{ n: number }>("select count(*)::int as n from public.tasks")).rows[0]?.n).toBe(0);
      expect((await db.query<{ n: number }>("select count(*)::int as n from private.dev_totp")).rows[0]?.n).toBe(1);
      expect((await db.query<{ provider: string }>("select provider from public.model_channels order by provider")).rows.map((r) => r.provider)).toEqual(["anthropic", "openai"]);
      const b = await seedLocal(db, { remoteUrl: "file:///tmp/x", password: "second-pw-test", totpSecret: () => "C".repeat(32) });
      expect(b.created).toBe(false);
      expect(b.totpSecret).toBeNull();
      expect((await db.query<{ s: string }>("select secret_b32 as s from private.dev_totp")).rows).toEqual([{ s: "B".repeat(32) }]);
      expect((await login("first-pw-test")).rows.length).toBe(0);
      expect((await login("second-pw-test")).rows.length).toBe(1);
      expect(verifyOnlineRows(await readLedgerOnline(db, DEMO_ORG_ID), DEMO_ORG_ID).ok).toBe(true);
    } finally {
      await db.end();
    }
  });
});
