import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ORG_ID } from "../../../../worker/src/online/seed";
import { streamTask } from "./api";
import type { ApiDeps } from "./api";
import { RateLimiter } from "./guard";
import { asService } from "./sql";
import { U, webDb } from "./web-db.test-helper";

let db: Awaited<ReturnType<typeof webDb>>;
let deps: ApiDeps;
let who: string | null = U.approver;
beforeAll(async () => {
  db = await webDb();
  deps = { db, user: () => Promise.resolve(who), secondFactor: () => Promise.resolve(null), createLimiter: new RateLimiter(10, 60_000) };
  await asService(db, async (sql) => {
    await sql.query("insert into public.agent_sessions (id, org_id, task_id, agent, model, role, state, step, touching) values ('s_live', $1, 't_seed_docs', 'claude', 'm', 'lead', 'running', 'x', '{}')", [DEMO_ORG_ID]);
    await sql.query("insert into public.session_lines (org_id, session_id, seq, kind, text) values ($1, 's_live', 0, 'text', 'здравей'), ($1, 's_live', 1, 'tool_call', 'Read: README.md')", [DEMO_ORG_ID]);
  });
});
afterAll(async () => db.end());

const get = (p: string, h: Record<string, string> = {}) => new Request(`http://localhost:3000${p}`, { headers: { host: "localhost:3000", ...h } });
const events = (body: string) => body.split("\n\n").filter((b) => b.startsWith("event: feed")).map((b) => ({ id: /^id: (.*)$/m.exec(b)?.[1], data: JSON.parse(/^data: (.*)$/m.exec(b)?.[1] ?? "null") as { session: string | null; lines: { seq: number }[]; task: { state: string } } }));

describe("GET /api/tasks/:id/stream (SSE)", () => {
  it("без вход → 401; непозната задача → 404; лош курсор → 400", async () => {
    who = null;
    expect((await streamTask(get("/api/tasks/t_seed_docs/stream"), deps, "t_seed_docs")).status).toBe(401);
    who = U.approver;
    expect((await streamTask(get("/api/tasks/t_nope/stream"), deps, "t_nope")).status).toBe(404);
    expect((await streamTask(get("/api/tasks/t_seed_docs/stream?after=x"), deps, "t_seed_docs")).status).toBe(400);
  });
  it("първо събитие с всичко, после само новото; id = сесия:последен seq", async () => {
    const r = await streamTask(get("/api/tasks/t_seed_docs/stream"), deps, "t_seed_docs", { intervalMs: 20, maxMs: 300 });
    expect(r.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(r.headers.get("cache-control")).toContain("no-store");
    const reading = r.text();
    await new Promise((ok) => setTimeout(ok, 80));
    await asService(db, (sql) => sql.query("insert into public.session_lines (org_id, session_id, seq, kind, text) values ($1, 's_live', 2, 'tool_result', 'Read [allowed]: ok')", [DEMO_ORG_ID]));
    const ev = events(await reading);
    expect(ev[0]?.data.lines.map((l) => l.seq)).toEqual([0, 1]);
    expect(ev[0]?.data.task.state).toBe("RUNNING");
    expect(ev[0]?.id).toBe("s_live:1");
    const later = ev.slice(1).flatMap((e) => e.data.lines.map((l) => l.seq));
    expect(later).toEqual([2]);
    expect(ev.at(-1)?.id).toBe("s_live:2");
  });
  it("Last-Event-ID продължава от курсора", async () => {
    const r = await streamTask(get("/api/tasks/t_seed_docs/stream", { "last-event-id": "s_live:1" }), deps, "t_seed_docs", { intervalMs: 20, maxMs: 60 });
    const ev = events(await r.text());
    expect(ev[0]?.data.lines.map((l) => l.seq)).toEqual([2]);
  });
});
