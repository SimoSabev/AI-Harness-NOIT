import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ResearchReport } from "@mandat/contract";
import { demoEnv } from "@mandat/research";
import { DEMO_ORG_ID } from "../../../../worker/src/online/seed";
import { runResearchOnce } from "../../../../worker/src/online/research";
import { U, webDb } from "./web-db.test-helper";
import { createResearch, researchChannels, researchFeed, researchQuestions, researchReport, stopResearch } from "./research";
import { getResearchReport } from "./api";
import type { ApiDeps } from "./api";

// E9d (D-398): research from the web — queue, follow, stop, download — under RLS.
let db: Awaited<ReturnType<typeof webDb>>;
beforeAll(async () => {
  db = await webDb();
});
afterAll(async () => db.end());

const ask = { question: "How does JCS sort keys?", depth: "standard", goal: "balanced" };

describe("research in the web (D-398)", () => {
  it("a member with research.ask queues a question; a bad body or an unknown channel is refused", async () => {
    const r = await createResearch(db, { uid: U.owner, org: DEMO_ORG_ID, body: ask });
    expect(r.status).toBe(201);
    expect((await researchQuestions(db, U.viewer, DEMO_ORG_ID))[0]).toMatchObject({ id: r.body.id, status: "queued", depth: "standard" });
    expect((await createResearch(db, { uid: U.owner, org: DEMO_ORG_ID, body: { question: "" } })).status).toBe(400);
    expect((await createResearch(db, { uid: U.owner, org: DEMO_ORG_ID, body: { ...ask, routing: { writer: "00000000-0000-4000-8000-00000000dead" } } })).body).toEqual({ error: "unknown_channel" });
  });
  it("a viewer cannot ask or stop", async () => {
    expect((await createResearch(db, { uid: U.viewer, org: DEMO_ORG_ID, body: ask })).status).toBe(403);
  });
  it("the feed: events after a cursor, then the report once it is done", async () => {
    await db.query("update public.research_questions set status = 'done' where status = 'queued'");
    const r = await createResearch(db, { uid: U.owner, org: DEMO_ORG_ID, body: ask });
    const id = String(r.body.id);
    expect(await runResearchOnce({ db, envFor: async () => demoEnv(), stopPollMs: 50 })).toBe(id);
    const all = (await researchFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!;
    expect(all.events[0]?.kind).toBe("run_started");
    expect(all.report?.id).toBe(id);
    const tail = (await researchFeed(db, U.viewer, DEMO_ORG_ID, id, all.events.at(-3)!.seq))!;
    expect(tail.events.map((e) => e.seq)).toEqual(all.events.slice(-2).map((e) => e.seq));
    expect(await researchFeed(db, U.viewer, "00000000-0000-4000-8000-000000000999", id, -1)).toBeNull();
    expect(ResearchReport.parse(await researchReport(db, U.viewer, DEMO_ORG_ID, id)).status).toBe("done");
  });
  it("the report downloads as a self-contained HTML with a strict CSP, as Markdown and as JSON", async () => {
    const id = (await researchQuestions(db, U.viewer, DEMO_ORG_ID)).find((q) => q.has_report)!.id;
    const deps = { db, user: async () => U.viewer } as unknown as ApiDeps;
    const html = await getResearchReport(new Request(`http://x/api/research/${id}/report?format=html`), deps, id);
    expect(html.status).toBe(200);
    expect(html.headers.get("content-disposition")).toBe(`attachment; filename="research-${id}.html"`);
    expect(html.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(await html.text()).toMatch(/^<!doctype html>/);
    const md = await getResearchReport(new Request(`http://x/api/research/${id}/report?format=md`), deps, id);
    expect(await md.text()).toContain("## ");
    expect((await getResearchReport(new Request(`http://x/api/research/${id}/report?format=exe`), deps, id)).status).toBe(400);
    expect((await getResearchReport(new Request("http://x/api/research/bad/report"), deps, "../etc")).status).toBe(404);
  });
  it("stop: a queued question stops at once; a finished one cannot be stopped", async () => {
    const r = await createResearch(db, { uid: U.owner, org: DEMO_ORG_ID, body: ask });
    expect(await stopResearch(db, { uid: U.owner, org: DEMO_ORG_ID, id: String(r.body.id) })).toMatchObject({ status: 200, body: { status: "stopped" } });
    expect((await stopResearch(db, { uid: U.owner, org: DEMO_ORG_ID, id: String(r.body.id) })).status).toBe(409);
    expect((await stopResearch(db, { uid: U.viewer, org: DEMO_ORG_ID, id: String(r.body.id) })).status).toBe(403);
  });
  it("the model channels for the form are the org's", async () => {
    expect(Array.isArray(await researchChannels(db, U.viewer, DEMO_ORG_ID))).toBe(true);
  });
});
