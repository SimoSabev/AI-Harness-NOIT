import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ResearchReport } from "@mandat/contract";
import { demoEnv } from "@mandat/research";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, seedMinimal } from "./seed.js";
import { claimResearch, processResearch, reapStaleResearch, runResearchOnce } from "./research.js";
import type { ResearchDeps } from "./research.js";

// E9г (D-398): the worker's research queue over the real migrations (PGlite).
let db: Awaited<ReturnType<typeof pgliteDb>>;
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
});
afterAll(() => db.end());

const queue = (id: string, request: unknown = { question: "How does JCS sort keys?", depth: "standard", goal: "balanced" }) =>
  db.query("insert into public.research_questions (id, org_id, question, request, depth, goal) values ($1, $2::uuid, 'How does JCS sort keys?', $3::jsonb, 'standard', 'balanced')", [id, DEMO_ORG_ID, JSON.stringify(request)]);
const deps = (o: Partial<ResearchDeps> = {}): ResearchDeps => ({ db, envFor: async () => demoEnv(), stopPollMs: 20, ...o });

describe("the research queue (D-398)", () => {
  it("a queued question runs: events in order, sources, claims and the report are stored", async () => {
    await queue("q_w1");
    expect(await runResearchOnce(deps())).toBe("q_w1");
    const q = (await db.query<{ status: string; report: unknown; draft: string; usd: string }>("select status, report, draft, usd::text from public.research_questions where id = 'q_w1'")).rows[0]!;
    expect(q.status).toBe("done");
    expect(ResearchReport.parse(q.report).id).toBe("q_w1");
    const ev = (await db.query<{ seq: number; kind: string }>("select seq, kind from public.research_events where question_id = 'q_w1' order by seq")).rows;
    expect(ev[0]?.kind).toBe("run_started");
    expect(ev.at(-1)?.kind).toBe("run_finished");
    expect(ev.map((e) => e.seq)).toEqual(ev.map((_e, i) => i));
    const src = (await db.query<{ n: number; content_hash: string; tier: string }>("select n, content_hash, tier from public.research_sources where question_id = 'q_w1' order by n")).rows;
    expect(src.length).toBeGreaterThanOrEqual(3);
    expect(src[0]?.content_hash).toMatch(/^sha256:/);
    expect((await db.query("select 1 from public.research_claims where question_id = 'q_w1'")).rows.length).toBeGreaterThan(0);
  });
  it("at most two running per org; the third waits", async () => {
    await db.query("update public.research_questions set status = 'done'");
    for (const id of ["q_a", "q_b", "q_c"]) await queue(id);
    expect((await claimResearch(db))?.id).toBe("q_a");
    expect((await claimResearch(db))?.id).toBe("q_b");
    expect(await claimResearch(db)).toBeNull();
    await db.query("update public.research_questions set status = 'done' where id in ('q_a', 'q_b', 'q_c')");
  });
  it("Stop: the run ends as stopped with what it has", async () => {
    await queue("q_stop");
    const q = (await claimResearch(db))!;
    setTimeout(() => void db.query("update public.research_questions set stop_requested = true where id = 'q_stop'"), 30);
    const r = await processResearch(deps({ envFor: async () => demoEnv({ delayMs: 25 }) }), q);
    expect(r?.partial).toBe("stopped");
    expect((await db.query<{ status: string }>("select status from public.research_questions where id = 'q_stop'")).rows[0]?.status).toBe("stopped");
  });
  it("a bad request or no usable model → failed with a reason, never a throw", async () => {
    await queue("q_bad", { question: "" });
    await runResearchOnce(deps());
    expect((await db.query<{ status: string; error: string }>("select status, error from public.research_questions where id = 'q_bad'")).rows[0]).toMatchObject({ status: "failed", error: "the request does not match the schema" });
    await queue("q_nomodel");
    await runResearchOnce(deps({ envFor: async () => ({ ...demoEnv(), channels: [] }) }));
    expect((await db.query<{ status: string; error: string }>("select status, error from public.research_questions where id = 'q_nomodel'")).rows[0]?.error).toMatch(/no usable model/);
  });
  it("a run without a heartbeat for 2 minutes is reaped", async () => {
    await queue("q_dead");
    await db.query("update public.research_questions set status = 'running', heartbeat_at = now() - interval '3 minutes' where id = 'q_dead'");
    expect(await reapStaleResearch(db)).toEqual(["q_dead"]);
  });
});
