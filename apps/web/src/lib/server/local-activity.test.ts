import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { postLocalActivity } from "./api";
import { RateLimiter } from "./guard";
import { localActivity } from "./local-activity";
import { U, webDb } from "./web-db.test-helper";

// E9g A3 (D-373): every use of a local grant ("Apply locally", "Open in editor") is a row in task_activities with its
// author — not the ledger. The server writes the text from a closed set of fields; free text never gets in.
let db: Awaited<ReturnType<typeof webDb>>;
beforeAll(async () => {
  db = await webDb();
  const org = (await db.query<{ org_id: string }>("select org_id::text as org_id from public.repos where id = $1", [DEMO_REPO_ID])).rows[0]?.org_id ?? "";
  await db.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, state) values ('t_local', $1::uuid, $2::uuid, 'bugfix', 'claude', 'x', 'DELIVERED')", [org, DEMO_REPO_ID]);
});
afterAll(() => db.end());

const rows = async () => (await db.query<{ kind: string; text: string; by_user: string }>("select kind, text, by_user::text as by_user from public.task_activities where task_id = 't_local' order by id")).rows;

describe("local actions in task_activities (E9g A3)", () => {
  it("apply and editor uses are stored with the author and a fixed text", async () => {
    expect(await localActivity(db, { uid: U.owner, taskId: "t_local", body: { kind: "local_apply", outcome: "applied", detail: "abcdef1234567890" } })).toMatchObject({ status: 200 });
    expect(await localActivity(db, { uid: U.viewer, taskId: "t_local", body: { kind: "local_editor", outcome: "opened", detail: "src/cart.ts" } })).toMatchObject({ status: 200 });
    expect(await localActivity(db, { uid: U.owner, taskId: "t_local", body: { kind: "local_apply", outcome: "refused", detail: "diverged: rebase" } })).toMatchObject({ status: 200 });
    expect(await rows()).toEqual([
      { kind: "local_apply", text: "Applied locally: applied (abcdef1234567890)", by_user: U.owner },
      { kind: "local_editor", text: "Opened in editor: opened (src/cart.ts)", by_user: U.viewer },
      { kind: "local_apply", text: "Applied locally: refused (diverged: rebase)", by_user: U.owner },
    ]);
  });
  it("a bad body → 400, an unknown task → 404; nothing stored; no ledger row", async () => {
    const before = (await rows()).length;
    expect((await localActivity(db, { uid: U.owner, taskId: "t_local", body: { kind: "terminal", outcome: "opened" } })).status).toBe(400);
    expect((await localActivity(db, { uid: U.owner, taskId: "t_local", body: { kind: "local_apply", outcome: "applied", text: "free" } })).status).toBe(400);
    expect((await localActivity(db, { uid: U.owner, taskId: "t_nope", body: { kind: "local_apply", outcome: "applied" } })).status).toBe(404);
    expect((await rows()).length).toBe(before);
  });
});

describe("POST /api/tasks/:id/local-activity (E9g A3)", () => {
  const csrf = "c".repeat(43);
  const req = (h: Record<string, string> = {}) =>
    new Request("http://localhost:3000/api/tasks/t_local/local-activity", { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", cookie: `mandat_csrf=${csrf}`, "x-mandat-csrf": csrf, "content-type": "application/json", ...h }, body: JSON.stringify({ kind: "local_editor", outcome: "opened" }) });
  it("Origin + CSRF like every POST; then stored", async () => {
    const deps = { db, user: () => Promise.resolve(U.owner), secondFactor: () => Promise.resolve(null), createLimiter: new RateLimiter(10, 60_000) };
    expect((await postLocalActivity(req({ origin: "https://evil.example" }), deps, "t_local")).status).toBe(403);
    expect((await postLocalActivity(req({ "x-mandat-csrf": "d".repeat(43) }), deps, "t_local")).status).toBe(403);
    expect((await postLocalActivity(req(), deps, "../x")).status).toBe(404);
    expect((await postLocalActivity(req(), deps, "t_local")).status).toBe(200);
  });
});
