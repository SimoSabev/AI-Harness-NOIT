import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeModel } from "@mandat/research";
import type { RouterChannel } from "@mandat/research";
import { DEMO_ORG_ID, DEMO_REPO_ID } from "../../../../worker/src/online/seed";
import { runConversationOnce } from "../../../../worker/src/online/conversation";
import { conversationFeed, sendMessage } from "./conversation";
import { approveProject } from "./project-interview";
import { asService } from "./sql";
import { U, webDb } from "./web-db.test-helper";

// D-557: the interview of a whole project, from the web. A message with purpose "project" opens one (it needs the
// project); the worker answers with a brief; only an approver approves it, by its hash; the repo keeps it.
let db: Awaited<ReturnType<typeof webDb>>;
beforeAll(async () => {
  db = await webDb();
});
afterAll(async () => db.end());

const ch: RouterChannel = { id: "x", label: "x", kind: "local", model: "m-1", enabled: true, health: "ok", quality: 1, cost: 0 };
const project = { product: "An online shop", users: ["customers"], works_today: ["checkout"], must_not_break: ["no discount at 50"], commands: { test: "pnpm test" }, stack: ["TypeScript"], approver: "Simo", budget_usd: 5, notes: [] };
const repoBrief = async () => (await asService(db, (sql) => sql.query<{ brief: unknown; brief_hash: string | null; brief_approved_at: string | null }>("select brief, brief_hash, brief_approved_at::text from public.repos where id = $1::uuid", [DEMO_REPO_ID]))).rows[0];

describe("the project interview from the web (D-557)", () => {
  it("needs the project; the worker's brief is shown; a viewer, a stale hash or an unready brief are refused; the approver's lands on the repo", async () => {
    expect((await sendMessage(db, { uid: U.approver, org: DEMO_ORG_ID, body: { text: "get to know it", agent: "fake:honest-fix", purpose: "project" } })).body).toEqual({ error: "project_needs_repo" });
    const r = await sendMessage(db, { uid: U.approver, org: DEMO_ORG_ID, body: { text: "get to know it", agent: "fake:honest-fix", repo: DEMO_REPO_ID, purpose: "project" } });
    expect(r.status).toBe(201);
    const id = String(r.body.id);
    await db.query("update public.conversations set status = 'idle' where id <> $1 and status = 'queued'", [id]);
    // not ready yet: no test command
    await runConversationOnce({ db, modelFor: () => ({ ok: true, client: fakeModel(ch, () => JSON.stringify({ say: "Here", call: { tool: "propose_project", brief: { ...project, commands: {} } } })) }) });
    let f = (await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!;
    const notReady = f.turns.find((t) => t.kind === "project");
    expect(notReady).toMatchObject({ ready: false, missing: ["commands.test"] });
    expect((await approveProject(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { brief_hash: notReady?.kind === "project" ? notReady.hash : "" } })).body).toEqual({ error: "brief_not_ready" });
    // the ready one
    await sendMessage(db, { uid: U.approver, org: DEMO_ORG_ID, body: { conversation: id, text: "pnpm test", agent: "fake:honest-fix" } });
    await runConversationOnce({ db, modelFor: () => ({ ok: true, client: fakeModel(ch, () => JSON.stringify({ say: "Done", call: { tool: "propose_project", brief: project } })) }) });
    f = (await conversationFeed(db, U.viewer, DEMO_ORG_ID, id, -1))!;
    expect(f.conversation.purpose).toBe("project");
    const ready = f.turns.findLast((t) => t.kind === "project");
    const hash = ready?.kind === "project" ? ready.hash : "";
    expect(ready).toMatchObject({ ready: true });
    expect((await approveProject(db, { uid: U.viewer, org: DEMO_ORG_ID, id, body: { brief_hash: hash } })).status).toBe(403);
    expect((await approveProject(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { brief_hash: `sha256:${"0".repeat(64)}` } })).body).toEqual({ error: "brief_changed" });
    expect((await repoBrief())?.brief_approved_at).toBeNull();
    const ok = await approveProject(db, { uid: U.approver, org: DEMO_ORG_ID, id, body: { brief_hash: hash } });
    expect(ok).toEqual({ status: 200, body: { id, brief_hash: hash } });
    expect(await repoBrief()).toMatchObject({ brief: project, brief_hash: hash });
    expect((await repoBrief())?.brief_approved_at).not.toBeNull();
    const led = (await asService(db, (sql) => sql.query<{ payload_jcs: string }>("select payload_jcs from public.ledger where kind = 'project_approved'"))).rows.map((x) => JSON.parse(x.payload_jcs) as Record<string, unknown>);
    expect(led).toEqual([{ conversation: id, repo: DEMO_REPO_ID, brief_hash: hash, by: U.approver }]);
  });
  it("a task conversation has no brief to approve", async () => {
    const r = await sendMessage(db, { uid: U.approver, org: DEMO_ORG_ID, body: { text: "fix it", agent: "fake:honest-fix", repo: DEMO_REPO_ID } });
    expect((await approveProject(db, { uid: U.approver, org: DEMO_ORG_ID, id: String(r.body.id), body: { brief_hash: `sha256:${"0".repeat(64)}` } })).body).toEqual({ error: "not_a_project_interview" });
  });
});
