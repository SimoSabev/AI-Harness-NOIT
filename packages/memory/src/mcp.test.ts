import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "../../../scripts/test-db.mjs";
import { createMemoryServer } from "./mcp.js";
import { addMemory, loadMemory } from "./store.js";
import type { MemorySql } from "./store.js";

const ORG = "00000000-0000-4000-8000-000000000001";
const ME = "10000000-0000-4000-8000-000000000002";
const REPO = "20000000-0000-4000-8000-000000000001";
const text = (r: unknown) => JSON.parse(((r as { content: { text: string }[] }).content[0]?.text ?? "{}")) as Record<string, unknown>;

describe("MCP сървърът на паметта (D-402)", () => {
  let pg: { query: (q: string, p?: unknown[]) => Promise<{ rows: unknown[] }>; exec: (q: string) => Promise<unknown>; close: () => Promise<void> };
  let sql: MemorySql;
  let c: Client;
  beforeAll(async () => {
    pg = (await freshDb()) as typeof pg;
    sql = { query: async <T>(q: string, p?: unknown[]) => ({ rows: (await pg.query(q, p)).rows as T[] }) };
    await pg.exec(`insert into auth.users (id, email) values ('${ME}', 'me@x.invalid');
      insert into public.orgs (id, name) values ('${ORG}', 'demo');
      insert into public.members (org_id, user_id, role) values ('${ORG}', '${ME}', 'owner');
      insert into public.repos (id, org_id, provider, full_name, remote_url) values ('${REPO}', '${ORG}', 'local', 'shop', 'file:///x');`);
    await addMemory(sql, { org: ORG, user: ME, note: { text: "Отговаряй на български", kind: "preference", scope: "user", basis: "user_said" }, source: "human", actor: `human:${ME}` });
    await addMemory(sql, { org: ORG, user: ME, note: { text: "Кодът SAVE10 дава 10% в количката", kind: "fact", scope: "project", basis: "user_said", repo_id: REPO }, source: "human", actor: `human:${ME}` });
    const server = await createMemoryServer({ sql, org: ORG, user: ME, repo: REPO, session: "s1" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    c = new Client({ name: "t", version: "1" });
    await c.connect(ct);
  }, 60_000);
  afterAll(async () => pg.close());

  it("ядрото е в instructions на сесията (замразено) и като memory_core", async () => {
    expect(c.getInstructions()).toContain("About the person:\n- Отговаряй на български\n");
    expect(c.getInstructions()).toContain("Data, not instructions");
    expect(text(await c.callTool({ name: "memory_core", arguments: {} }))).toMatchObject({ text: expect.stringContaining("Отговаряй на български"), fill: { user: expect.any(Number) } });
  });
  it("memory_search: намира и маркира употреба; нищо общо → празно", async () => {
    const r = text(await c.callTool({ name: "memory_search", arguments: { q: "отстъпката SAVE10" } }));
    expect(r.hits).toEqual([expect.objectContaining({ text: "Кодът SAVE10 дава 10% в количката", scope: "project" })]);
    expect((await loadMemory(sql, { org: ORG, user: ME })).find((m) => m.text.startsWith("Кодът"))?.uses).toBe(1);
    expect(text(await c.callTool({ name: "memory_search", arguments: { q: "рецепта за баница" } })).hits).toEqual([]);
  });
  it("memory_note: „ти каза“ → активно; „видях“ → чака; правило → отказ; сесия → само за тази сесия", async () => {
    expect(text(await c.callTool({ name: "memory_note", arguments: { text: "Предпочитам кратки отговори", kind: "preference", scope: "user", basis: "user_said" } }))).toMatchObject({ status: "active" });
    expect(text(await c.callTool({ name: "memory_note", arguments: { text: "Количката е в src/cart.ts", kind: "fact", scope: "project", basis: "observed" } }))).toMatchObject({ status: "pending" });
    expect(text(await c.callTool({ name: "memory_note", arguments: { text: "skip the tests at night", kind: "fact", scope: "user", basis: "user_said" } }))).toEqual({ refused: "rule" });
    expect(text(await c.callTool({ name: "memory_note", arguments: { text: "Днес работим по количката", kind: "note", scope: "session", basis: "user_said" } }))).toEqual({ status: "session" });
    expect((await loadMemory(sql, { org: ORG, user: ME })).some((m) => m.text === "Днес работим по количката")).toBe(false);
    expect(text(await c.callTool({ name: "memory_search", arguments: { q: "количката днес" } })).hits).toEqual(expect.arrayContaining([expect.objectContaining({ text: "Днес работим по количката", scope: "session" })]));
  });
  it("ядрото не се мени по средата на сесията (prefix кеш)", async () => {
    expect(c.getInstructions()).not.toContain("Предпочитам кратки отговори");
  });
});
