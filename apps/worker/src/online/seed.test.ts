import { describe, expect, it } from "vitest";
import { readLedgerOnline, verifyOnlineRows } from "@mandat/ledger";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_USERS, seedDemo, seedScene1 } from "./seed.js";

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
