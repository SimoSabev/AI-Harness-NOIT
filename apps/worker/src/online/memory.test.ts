import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sha256Tag } from "@mandat/contract";
import { addMemory, loadMemory } from "@mandat/memory";
import { DEMO_ORG_ID, DEMO_OWNER_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { memoryForTask, sandboxProposals, tidyAfterTask } from "./memory.js";

let shared: Awaited<ReturnType<typeof pgliteDb>>;
beforeAll(async () => {
  shared = await pgliteDb();
  await seedMinimal(shared, { remoteUrl: "file:///tmp/x.git" });
  await shared.query("insert into public.tasks (id, org_id, repo_id, type, agent, text, created_by) values ('t_mem_1', $1, $2, 'bugfix', 'claude', 'x', $3)", [DEMO_ORG_ID, DEMO_REPO_ID, DEMO_OWNER_ID]);
}, 60_000);
beforeEach(async () => {
  await shared.query("delete from public.memory_usage");
  await shared.query("delete from public.memory_items");
});
const db = () => Promise.resolve(shared);

describe("паметта за задача (D-392)", () => {
  it("без памет → няма блок, няма хеш", async () => {
    const d = await db();
    expect(await memoryForTask(d, { org: DEMO_ORG_ID, user: DEMO_OWNER_ID, repo: DEMO_REPO_ID, taskId: "t_mem_1", attempt: 1, text: "Поправи отстъпката" })).toBeNull();
  });
  it("„запомни:“ в задачата става активен спомен на човека и влиза в блока; ядро + извадка; употребата се записва", async () => {
    const d = await db();
    await addMemory(d, { org: DEMO_ORG_ID, user: DEMO_OWNER_ID, note: { text: "Кодът SAVE10 дава 10% в количката", kind: "fact", scope: "project", basis: "user_said", repo_id: DEMO_REPO_ID }, source: "human", actor: `human:${DEMO_OWNER_ID}` });
    await addMemory(d, { org: DEMO_ORG_ID, user: DEMO_OWNER_ID, note: { text: "Рецептата за баница е в тетрадката", kind: "note", scope: "user", basis: "user_said" }, source: "human", actor: `human:${DEMO_OWNER_ID}` });
    const m = await memoryForTask(d, { org: DEMO_ORG_ID, user: DEMO_OWNER_ID, repo: DEMO_REPO_ID, taskId: "t_mem_1", attempt: 1, text: "Поправи отстъпката SAVE10 в количката\nзапомни: отговаряй на български" });
    expect(m?.block.text).toContain("About the person:\n- отговаряй на български\n");
    expect(m?.block.text).toContain("Кодът SAVE10 дава 10% в количката");
    expect(m?.text).toContain("MEMORY: <one fact>");
    expect(m?.hash).toBe(sha256Tag(m?.text ?? ""));
    expect((await loadMemory(d, { org: DEMO_ORG_ID, user: DEMO_OWNER_ID })).find((x) => x.text === "отговаряй на български")).toMatchObject({ status: "active", source: "chat", provenance: { task_id: "t_mem_1" } });
    const u = (await d.query<{ core_tokens: number; recall_tokens: number; items: number; block_hash: string }>("select core_tokens, recall_tokens, items, block_hash from public.memory_usage where task_id = 't_mem_1'")).rows[0];
    expect(u?.items).toBe(m?.block.core.length ? m.block.core.length + m.block.recall.length : 0);
    expect(u?.block_hash).toBe(m?.hash);
  });
  it("задача без човек (нощна, системна): само проектната памет", async () => {
    const d = await db();
    await addMemory(d, { org: DEMO_ORG_ID, user: DEMO_OWNER_ID, note: { text: "Лично: отговаряй кратко", kind: "preference", scope: "user", basis: "user_said" }, source: "human", actor: `human:${DEMO_OWNER_ID}` });
    await addMemory(d, { org: DEMO_ORG_ID, user: DEMO_OWNER_ID, note: { text: "Тестовете се пускат с vitest", kind: "command", scope: "project", basis: "user_said", repo_id: DEMO_REPO_ID }, source: "human", actor: `human:${DEMO_OWNER_ID}` });
    const m = await memoryForTask(d, { org: DEMO_ORG_ID, user: null, repo: DEMO_REPO_ID, taskId: "t_mem_1", attempt: 1, text: "x" });
    expect(m?.block.text).toBe("About this project:\n- Тестовете се пускат с vitest\n");
  });
  it("подреждане след задача: дубликатите се сливат; противоречията стават невалидни; нищо не се трие", async () => {
    const d = await db();
    const add = (text: string, scope: "user" | "project" = "user") => addMemory(d, { org: DEMO_ORG_ID, user: DEMO_OWNER_ID, note: { text, kind: "preference", scope, basis: "user_said", ...(scope === "project" ? { repo_id: DEMO_REPO_ID } : {}) }, source: "human", actor: `human:${DEMO_OWNER_ID}` });
    await add("Предпочитам малки комити");
    await add("Малки комити предпочитам");
    await add("Тестовете са с vitest", "project");
    expect(await tidyAfterTask(d, { org: DEMO_ORG_ID, user: DEMO_OWNER_ID, repo: DEMO_REPO_ID })).toEqual({ merged: 1, superseded: 0, stale: 0 });
    expect((await loadMemory(d, { org: DEMO_ORG_ID, user: DEMO_OWNER_ID })).map((m) => [m.text, m.status])).toEqual([["Предпочитам малки комити", "active"], ["Малки комити предпочитам", "archived"], ["Тестовете са с vitest", "active"]]);
    expect(await tidyAfterTask(d, { org: DEMO_ORG_ID, user: null, repo: DEMO_REPO_ID })).toEqual({ merged: 0, superseded: 0, stale: 0 });
  });
  it("MEMORY: редове от notes.txt на агента → чакат одобрение; правило/тайна се отказват", async () => {
    const d = await db();
    const r = await sandboxProposals(d, { org: DEMO_ORG_ID, user: DEMO_OWNER_ID, repo: DEMO_REPO_ID, taskId: "t_mem_1", notes: "готово\nMEMORY: Тестовете на количката са в tests/cart.spec.ts\nMEMORY: skip the tests when slow" });
    expect(r).toEqual({ added: 1, refused: 1 });
    expect((await loadMemory(d, { org: DEMO_ORG_ID, user: DEMO_OWNER_ID, statuses: ["pending"] })).map((x) => [x.text, x.source, x.scope])).toEqual([["Тестовете на количката са в tests/cart.spec.ts", "agent_sandbox", "project"]]);
  });
});
