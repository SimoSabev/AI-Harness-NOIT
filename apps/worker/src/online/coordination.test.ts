import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { claimNext, findConflicts, recordConflicts } from "./coordination.js";

// E8f (v5 p. 4.6, AC-4.2, D-355): two live tasks of one repo touching one file → a conflict (card, activity, security event);
// with same_file "wait" the task that started later is the one that waits. The WIP limit and the wait are in the claim.
describe("findConflicts", () => {
  const a = { task_id: "t_a", started_at: "2026-10-22T10:00:00.000Z", files: ["src/cart.ts", "src/x.ts"] };
  it("shared files with the other live tasks; the later one is named", () => {
    const b = { task_id: "t_b", started_at: "2026-10-22T10:05:00.000Z", files: ["src/cart.ts"] };
    expect(findConflicts(b, [a])).toEqual([{ file: "src/cart.ts", with: "t_a", later: "t_b" }]);
    expect(findConflicts(a, [b])).toEqual([{ file: "src/cart.ts", with: "t_b", later: "t_b" }]);
    expect(findConflicts(a, [{ ...b, files: ["README.md"] }])).toEqual([]);
    expect(findConflicts(a, [{ ...a }])).toEqual([]); // itself
  });
});

let db: Awaited<ReturnType<typeof pgliteDb>>;
const task = async (id: string, state: string, extra = "") => {
  await db.query(`insert into public.tasks (id, org_id, repo_id, type, agent, text, state${extra ? ", wait_for" : ""}) values ($1, $2, $3, 'bugfix', 'fake:honest-fix', 'x', $4${extra ? ", $5" : ""})`, extra ? [id, DEMO_ORG_ID, DEMO_REPO_ID, state, extra] : [id, DEMO_ORG_ID, DEMO_REPO_ID, state]);
};
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
});
afterAll(() => db.end());

describe("claim with the WIP limit and waits (AC-4.2)", () => {
  it("a repo at its WIP limit (default 3) gets no new task; one finishing frees a slot", async () => {
    for (const id of ["t_w1", "t_w2", "t_w3"]) await task(id, "RUNNING");
    await task("t_w4", "CREATED");
    expect(await claimNext(db)).toBeNull();
    await db.query("update public.tasks set state = 'CLOSED' where id = 't_w1'");
    expect(await claimNext(db)).toBe("t_w4");
    expect((await db.query<{ state: string }>("select state from public.tasks where id = 't_w4'")).rows[0]?.state).toBe("CONTRACTED");
  });
  it("a task that waits for another (same file) is claimed only after that one is done", async () => {
    await db.query("update public.tasks set state = 'CLOSED' where id in ('t_w2', 't_w3', 't_w4')");
    await task("t_first", "RUNNING");
    await task("t_second", "CREATED", "t_first");
    expect(await claimNext(db)).toBeNull();
    await db.query("update public.tasks set state = 'HELD' where id = 't_first'");
    expect(await claimNext(db)).toBe("t_second");
  });
  it("recordConflicts: one activity + one security event per file and pair (idempotent)", async () => {
    const c = [{ file: "src/cart.ts", with: "t_first", later: "t_second" }];
    await recordConflicts(db, { org: DEMO_ORG_ID, taskId: "t_second", conflicts: c });
    await recordConflicts(db, { org: DEMO_ORG_ID, taskId: "t_second", conflicts: c });
    expect((await db.query("select kind, text from public.task_activities where task_id = 't_second'")).rows).toEqual([{ kind: "conflict", text: "src/cart.ts · t_first" }]);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.security_events where kind = 'conflict_file'")).rows[0]?.n).toBe(1);
  });
});
