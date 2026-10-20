import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ORG_ID } from "../../../../worker/src/online/seed";
import { board, inbox, membership, taskDetail } from "./queries";
import { U, webDb } from "./web-db.test-helper";

// Демо промпт т. 8.1: rls-web (viewer does not see diff/task_activities) + the inbox of the seed (3 cards + summary).
let db: Awaited<ReturnType<typeof webDb>>;
beforeAll(async () => (db = await webDb()));
afterAll(async () => db.end());

describe("rls-web", () => {
  it("viewer вижда картата, но не diff и task_activities; approver вижда всичко", async () => {
    const asViewer = await taskDetail(db, U.viewer, DEMO_ORG_ID, "viewer", "t_seed_bugfix");
    expect(asViewer?.task.id).toBe("t_seed_bugfix");
    expect(asViewer?.evidence.length).toBeGreaterThan(0);
    expect(asViewer?.diff).toBeNull();
    expect(asViewer?.activities).toEqual([]);
    const asApprover = await taskDetail(db, U.approver, DEMO_ORG_ID, "approver", "t_seed_bugfix");
    expect(asApprover?.diff).toContain("diff --git");
    expect(asApprover?.activities.length).toBe(2);
    expect(asApprover?.ledger.length).toBeGreaterThan(0);
  });
  it("чужд потребител: без org, без задачи", async () => {
    const stranger = "e0000000-0000-4000-8000-000000000001";
    await db.query("insert into auth.users (id, email) values ($1, 'x@other.invalid')", [stranger]);
    expect(await membership(db, stranger)).toBeNull();
    expect((await inbox(db, stranger, DEMO_ORG_ID)).items).toEqual([]);
    expect(await taskDetail(db, stranger, DEMO_ORG_ID, "viewer", "t_seed_bugfix")).toBeNull();
  });
});

describe("inbox и дъска на seed-а", () => {
  it("3 карти, най-старата отгоре; обобщение за 24 ч", async () => {
    expect(await membership(db, U.approver)).toEqual({ org_id: DEMO_ORG_ID, role: "approver" });
    const ib = await inbox(db, U.approver, DEMO_ORG_ID);
    expect(ib.items.map((t) => t.id)).toEqual(["t_seed_feature", "t_seed_bugfix", "t_seed_failed"]);
    expect(ib.summary).toEqual({ autoMerged: 1, failed: 1, waiting: 3 });
  });
  it("дъска: 7 колони; ПРОВАЛ в 5; since връща само промененото", async () => {
    const b = await board(db, U.viewer, DEMO_ORG_ID);
    expect(b.columns.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const where = Object.fromEntries(b.columns.flatMap((c) => c.items.map((t) => [t.id, c.n])));
    expect(where).toEqual({ t_seed_docs: 2, t_seed_feature: 4, t_seed_bugfix: 4, t_seed_failed: 5, t_seed_css: 7 });
    const later = await board(db, U.viewer, DEMO_ORG_ID, { since: b.since });
    expect(later.columns.flatMap((c) => c.items)).toEqual([]);
    expect((await board(db, U.viewer, DEMO_ORG_ID, { column: 4 })).columns).toHaveLength(1);
  });
});
