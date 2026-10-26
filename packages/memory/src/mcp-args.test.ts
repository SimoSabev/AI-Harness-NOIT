import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "../../../scripts/test-db.mjs";
import { LOCAL_MEMORY_DB, parseMemoryArgs, resolveMemoryScope } from "./mcp-args.js";
import type { MemorySql } from "./store.js";

describe("аргументите на mandat-memory-mcp (D-394)", () => {
  it("по подразбиране базата на `pnpm local`; --repo и --user", () => {
    expect(parseMemoryArgs([], {})).toEqual({ ok: true, args: { dbUrl: LOCAL_MEMORY_DB, user: null, repo: null } });
    expect(LOCAL_MEMORY_DB).toBe("postgresql://postgres:postgres@127.0.0.1:54329/postgres");
    expect(parseMemoryArgs(["--repo", "mandat-demo/shop", "--user", "d0000000-0000-4000-8000-0000000000a1"], { MANDAT_DB_URL: "postgresql://x/y" })).toEqual({
      ok: true, args: { dbUrl: "postgresql://x/y", user: "d0000000-0000-4000-8000-0000000000a1", repo: "mandat-demo/shop" },
    });
  });
  it("грешки: непознат флаг, флаг без стойност, лош user, тайна в env", () => {
    expect(parseMemoryArgs(["--nope"], {})).toEqual({ ok: false, error: "unknown argument --nope" });
    expect(parseMemoryArgs(["--repo"], {})).toEqual({ ok: false, error: "--repo needs a value" });
    expect(parseMemoryArgs(["--user", "bob"], {})).toEqual({ ok: false, error: "--user must be a uuid" });
    expect(parseMemoryArgs([], { ANTHROPIC_API_KEY: "x" })).toEqual({ ok: false, error: "secrets not allowed in MCP env" });
  });
});

describe("кой и кой проект", () => {
  let pg: { query: (q: string, p?: unknown[]) => Promise<{ rows: unknown[] }>; exec: (q: string) => Promise<unknown>; close: () => Promise<void> };
  let sql: MemorySql;
  beforeAll(async () => {
    pg = (await freshDb()) as typeof pg;
    sql = { query: async <T>(q: string, p?: unknown[]) => ({ rows: (await pg.query(q, p)).rows as T[] }) };
    await pg.exec(`insert into auth.users (id, email) values ('10000000-0000-4000-8000-000000000002', 'me@x.invalid');
      insert into public.orgs (id, name) values ('00000000-0000-4000-8000-000000000001', 'demo');
      insert into public.members (org_id, user_id, role) values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'owner');
      insert into public.repos (id, org_id, provider, full_name, remote_url) values ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'local', 'mandat-demo/shop', 'file:///x');`);
  }, 60_000);
  afterAll(async () => pg.close());

  it("единственият собственик (pnpm local); проект по име или id", async () => {
    expect(await resolveMemoryScope(sql, { dbUrl: "", user: null, repo: "mandat-demo/shop" })).toEqual({ ok: true, org: "00000000-0000-4000-8000-000000000001", user: "10000000-0000-4000-8000-000000000002", repo: "20000000-0000-4000-8000-000000000001" });
    expect(await resolveMemoryScope(sql, { dbUrl: "", user: null, repo: null })).toMatchObject({ ok: true, repo: null });
    expect(await resolveMemoryScope(sql, { dbUrl: "", user: null, repo: "nope/nope" })).toEqual({ ok: false, error: "no such project: nope/nope" });
    expect(await resolveMemoryScope(sql, { dbUrl: "", user: "10000000-0000-4000-8000-0000000000ff", repo: null })).toEqual({ ok: false, error: "the user is not a member of any org" });
  });
});
