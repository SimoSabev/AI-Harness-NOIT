import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getBoard, getInbox, getTask, postApprove, postFailureLabel, postRetry, postStop, postTask } from "./api";
import type { ApiDeps } from "./api";
import { RateLimiter } from "./guard";
import { U, changesetOf, webDb } from "./web-db.test-helper";

let db: Awaited<ReturnType<typeof webDb>>;
let deps: ApiDeps;
const sent: string[] = [];
let who: string | null = U.approver;
const csrf = "c".repeat(43);
beforeAll(async () => {
  db = await webDb();
  deps = { db, user: () => Promise.resolve(who), secondFactor: () => Promise.resolve(null), broadcast: (topic) => (sent.push(topic), Promise.resolve()), createLimiter: new RateLimiter(10, 60_000) };
});
afterAll(async () => db.end());

const get = (p: string) => new Request(`http://localhost:3000${p}`, { headers: { host: "localhost:3000" } });
const post = (p: string, body: unknown, h: Record<string, string> = {}) =>
  new Request(`http://localhost:3000${p}`, { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", cookie: `mandat_csrf=${csrf}`, "x-mandat-csrf": csrf, "content-type": "application/json", ...h }, body: JSON.stringify(body) });

describe("API (т. 8.1)", () => {
  it("без вход → 401; GET inbox/board/task", async () => {
    who = null;
    expect((await getInbox(get("/api/inbox"), deps)).status).toBe(401);
    who = U.approver;
    const ib = (await (await getInbox(get("/api/inbox"), deps)).json()) as { items: unknown[] };
    expect(ib.items).toHaveLength(3);
    expect((await getBoard(get("/api/board?since=nope"), deps)).status).toBe(400);
    expect((await getBoard(get("/api/board?column=5"), deps)).status).toBe(200);
    expect((await getTask(get("/api/tasks/t_seed_failed"), deps, "t_seed_failed")).status).toBe(200);
    expect((await getTask(get("/api/tasks/x"), deps, "t_nope")).status).toBe(404);
  });
  it("POST: Origin + CSRF + zod", async () => {
    expect((await postStop(post("/api/tasks/t_seed_docs/stop", {}, { origin: "https://evil.example" }), deps, "t_seed_docs")).status).toBe(403);
    expect((await postStop(post("/api/tasks/t_seed_docs/stop", {}, { "x-mandat-csrf": "d".repeat(43) }), deps, "t_seed_docs")).status).toBe(403);
    expect((await postTask(post("/api/tasks", { type: "bugfix", agent: "claude", text: "x", extra: 1 }), deps)).status).toBe(400);
    const cs = await changesetOf(db, "t_seed_bugfix");
    expect((await postApprove(post(`/api/changesets/${cs.id}/approve`, { head_sha: "zz" }), deps, cs.id)).status).toBe(400);
    expect((await postApprove(post("/api/changesets/x/approve", {}), deps, "x")).status).toBe(404);
  });
  it("POST /api/tasks ≤ 10/мин; stop → BLOCKED stopped (не е в inbox); retry → CREATED; failure-label; broadcast", async () => {
    deps.createLimiter = new RateLimiter(10, 60_000);
    for (let i = 0; i < 10; i++) expect((await postTask(post("/api/tasks", { type: "bugfix", agent: "claude", text: `задача ${i}` }), deps)).status).toBe(201);
    expect((await postTask(post("/api/tasks", { type: "bugfix", agent: "claude", text: "11" }), deps)).status).toBe(429);
    expect((await postStop(post("/api/tasks/t_seed_docs/stop", {}), deps, "t_seed_docs")).status).toBe(200);
    expect((await postStop(post("/api/tasks/t_seed_docs/stop", {}), deps, "t_seed_docs")).status).toBe(409);
    const ib = (await (await getInbox(get("/api/inbox"), deps)).json()) as { items: { id: string }[] };
    expect(ib.items.map((t) => t.id)).not.toContain("t_seed_docs");
    expect((await postRetry(post("/api/tasks/t_seed_failed/retry", {}), deps, "t_seed_failed")).status).toBe(200);
    expect((await postRetry(post("/api/tasks/t_seed_css/retry", {}), deps, "t_seed_css")).status).toBe(409);
    const v = (await db.query<{ id: string }>("select id::text as id from public.verdicts where task_id = 't_seed_failed'")).rows[0]?.id as string;
    expect((await postFailureLabel(post(`/api/verdicts/${v}/failure-label`, { layer: "agent", label: "изтрит тест" }), deps, v)).status).toBe(200);
    expect(sent).toContain("task:t_seed_docs");
    expect(sent.some((t) => t.endsWith(":board"))).toBe(true);
    who = U.viewer;
    expect((await postRetry(post("/api/tasks/t_seed_docs/retry", {}), deps, "t_seed_docs")).status).toBe(403);
  });
});
