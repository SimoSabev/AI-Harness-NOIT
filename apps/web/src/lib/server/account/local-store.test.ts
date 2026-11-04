import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { webDb } from "../web-db.test-helper";
import { collectLocal, pgCache, pgLinkStore } from "./local-store";

// D-492: the device's link and cache in the local database (migration …_account_link.sql), on PGlite.
let db: Awaited<ReturnType<typeof webDb>>;
beforeAll(async () => {
  db = await webDb();
});
afterAll(async () => {
  await db.end();
});

describe("local account store (D-492)", () => {
  it("keeps one link; clearing it keeps the data but makes the next account a first sign-in", async () => {
    const links = pgLinkStore(db);
    const cache = pgCache(db);
    expect(await links.get()).toBeNull();
    await links.set({ server: "https://sync.example.org", state: "signed_in", token: "test-token", email: "a@b.c", vaultKey: null, lastSync: null });
    expect(await links.get()).toMatchObject({ state: "signed_in", email: "a@b.c", token: "test-token" });
    await cache.put({ kind: "prefs", id: "ui", body: { lang: "bg" }, deleted: false, rev: 4, base: { lang: "bg" }, dirty: false });
    await cache.setCursor(4);
    await links.set(null);
    expect(await links.get()).toBeNull();
    expect(await cache.cursor()).toBe(0);
    expect(await cache.all()).toEqual([{ kind: "prefs", id: "ui", body: { lang: "bg" }, deleted: false, rev: 0, base: null, dirty: true }]);
  });

  it("the local tables are closed to the browser's roles", async () => {
    const c = await db.connect();
    await c.query("begin");
    await c.query("set local role authenticated");
    const r = await c.query("select * from private.account_link").catch((e: unknown) => e);
    await c.query("rollback");
    c.release();
    expect(r).toBeInstanceOf(Error);
  });

  it("collects language, theme, projects and tasks; a key in a task's text is redacted first", async () => {
    const cache = pgCache(db);
    const repo = (await db.query<{ id: string }>("select id::text as id from public.repos limit 1")).rows[0]?.id as string;
    await db.query("update public.tasks set text = 'use sk-ant-api03-TESTONLY-abcdefghijklmnopqrstuvwxyz please' where id = (select id from public.tasks order by created_at limit 1)");
    await collectLocal(db, cache, { lang: "en", theme: "dark" });
    const all = await cache.all();
    expect(all.find((e) => e.kind === "prefs")?.body).toEqual({ lang: "en", theme: "dark" });
    expect(all.some((e) => e.kind === "project" && e.id === repo)).toBe(true);
    expect(all.filter((e) => e.kind === "task").length).toBeGreaterThan(0);
    expect(JSON.stringify(all)).not.toContain("sk-ant-api03");
    // unchanged data is not marked again
    for (const e of all) await cache.put({ ...e, dirty: false, rev: 1, base: e.body });
    await collectLocal(db, cache, { lang: "en", theme: "dark" });
    expect((await cache.all()).every((e) => !e.dirty)).toBe(true);
  });
});
