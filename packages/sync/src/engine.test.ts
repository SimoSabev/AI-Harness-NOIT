import { describe, expect, it, vi } from "vitest";
import { createSyncEngine, memoryCache, type SyncTransport } from "./engine.js";
import { createSyncServer, memorySyncStore } from "./server.js";

const direct = (server: ReturnType<typeof createSyncServer>, uid: string): SyncTransport => ({
  pull: (since) => server.pull(uid, since),
  push: (req) => server.push(uid, req.changes),
});

describe("sync engine (D-492)", () => {
  it("without an account it does nothing and calls no transport", async () => {
    const pull = vi.fn();
    const push = vi.fn();
    const cache = memoryCache([{ kind: "prefs", id: "ui", body: { lang: "bg" }, deleted: false }]);
    const engine = createSyncEngine({ transport: () => Promise.resolve(null), cache });
    expect(await engine.syncOnce()).toEqual({ state: "off" });
    expect(pull).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect((await cache.all())[0]?.dirty).toBe(true); // still local, nothing lost
  });

  it("two devices converge through the server", async () => {
    const server = createSyncServer(memorySyncStore());
    const one = memoryCache([{ kind: "prefs", id: "ui", body: { lang: "bg", theme: "light" }, deleted: false }]);
    const two = memoryCache([]);
    const e1 = createSyncEngine({ transport: () => Promise.resolve(direct(server, "u")), cache: one });
    const e2 = createSyncEngine({ transport: () => Promise.resolve(direct(server, "u")), cache: two });
    await e1.syncOnce();
    await e2.syncOnce();
    expect((await two.all()).map((r) => r.body)).toEqual([{ lang: "bg", theme: "light" }]);

    await one.edit("prefs", "ui", { lang: "en", theme: "light" });
    await two.edit("prefs", "ui", { lang: "bg", theme: "dark" });
    await e1.syncOnce();
    const r = await e2.syncOnce();
    expect(r).toMatchObject({ state: "ok", conflicts: [] }); // different fields: both changes kept
    await e1.syncOnce();
    expect((await one.all())[0]?.body).toEqual({ lang: "en", theme: "dark" });
    expect((await two.all())[0]?.body).toEqual({ lang: "en", theme: "dark" });
    expect((await one.all()).every((x) => !x.dirty)).toBe(true);
  });

  it("the same field changed on both devices: the server's value stays and the loss is reported", async () => {
    const server = createSyncServer(memorySyncStore());
    const one = memoryCache([{ kind: "prefs", id: "ui", body: { theme: "light" }, deleted: false }]);
    const two = memoryCache([]);
    const e1 = createSyncEngine({ transport: () => Promise.resolve(direct(server, "u")), cache: one });
    const e2 = createSyncEngine({ transport: () => Promise.resolve(direct(server, "u")), cache: two });
    await e1.syncOnce();
    await e2.syncOnce();
    await one.edit("prefs", "ui", { theme: "dark" });
    await two.edit("prefs", "ui", { theme: "system" });
    await e1.syncOnce();
    const r = await e2.syncOnce();
    expect(r).toMatchObject({ state: "ok", conflicts: [{ kind: "prefs", id: "ui", field: "theme", local: "system", server: "dark" }] });
    expect((await two.all())[0]?.body).toEqual({ theme: "dark" });
  });

  it("refuses to push a plaintext key and leaves it local", async () => {
    const server = createSyncServer(memorySyncStore());
    const cache = memoryCache([{ kind: "connection", id: "c", body: { key: "sk-ant-api03-TESTONLY-abcdefghijklmnopqrstuvwxyz" }, deleted: false }]);
    const e = createSyncEngine({ transport: () => Promise.resolve(direct(server, "u")), cache });
    await expect(e.syncOnce()).rejects.toThrow(/plaintext/);
    expect((await server.pull("u", 0)).records).toEqual([]);
  });
});
