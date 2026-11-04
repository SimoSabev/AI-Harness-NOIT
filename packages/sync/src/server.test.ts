import { describe, expect, it } from "vitest";
import { MandatError } from "@mandat/contract";
import { createSyncServer, memorySyncStore } from "./server.js";

const A = "user-a";
const B = "user-b";

describe("sync server rules (D-491)", () => {
  it("stores a change, hands out a revision and returns it on pull", async () => {
    const s = createSyncServer(memorySyncStore(() => "2026-11-04T10:00:00.000Z"));
    const r = await s.push(A, [{ kind: "prefs", id: "ui", baseRev: 0, deleted: false, body: { lang: "bg" } }]);
    expect(r.accepted).toEqual([{ kind: "prefs", id: "ui", rev: 1 }]);
    const p = await s.pull(A, 0);
    expect(p.records).toEqual([{ kind: "prefs", id: "ui", rev: 1, updatedAt: "2026-11-04T10:00:00.000Z", deleted: false, body: { lang: "bg" } }]);
    expect(p.cursor).toBe(1);
    expect((await s.pull(A, 1)).records).toEqual([]);
  });

  it("a stale base revision is a conflict that carries the server's copy", async () => {
    const s = createSyncServer(memorySyncStore());
    await s.push(A, [{ kind: "prefs", id: "ui", baseRev: 0, deleted: false, body: { lang: "bg" } }]);
    await s.push(A, [{ kind: "prefs", id: "ui", baseRev: 1, deleted: false, body: { lang: "en" } }]);
    const r = await s.push(A, [{ kind: "prefs", id: "ui", baseRev: 1, deleted: false, body: { lang: "de" } }]);
    expect(r.accepted).toEqual([]);
    expect(r.conflicts.map((c) => [c.rev, c.body])).toEqual([[2, { lang: "en" }]]);
  });

  it("one person never sees another's records (the server-side RLS rule)", async () => {
    const s = createSyncServer(memorySyncStore());
    await s.push(A, [{ kind: "project", id: "p", baseRev: 0, deleted: false, body: { name: "a" } }]);
    expect((await s.pull(B, 0)).records).toEqual([]);
    const r = await s.push(B, [{ kind: "project", id: "p", baseRev: 0, deleted: false, body: { name: "b" } }]);
    expect(r.accepted).toHaveLength(1);
    expect((await s.pull(A, 0)).records[0]?.body).toEqual({ name: "a" });
  });

  it("refuses a plaintext key even if a device tries to send one", async () => {
    const s = createSyncServer(memorySyncStore());
    await expect(s.push(A, [{ kind: "secret", id: "k", baseRev: 0, deleted: false, body: { value: "sk-ant-api03-TESTONLY-abcdefghijklmnopqrstuvwxyz" } }])).rejects.toThrow(MandatError);
    expect((await s.pull(A, 0)).records).toEqual([]);
  });

  it("delete-my-data wipes records and the wrapped vault key of that person only", async () => {
    const s = createSyncServer(memorySyncStore());
    const wrapped = { v: 1 as const, kdf: "scrypt" as const, n: 1024, r: 8, p: 1, salt: "s", kid: "0123456789abcdef", iv: "i", ct: "c", tag: "t" };
    await s.putVault(A, wrapped);
    await s.push(A, [{ kind: "task", id: "t", baseRev: 0, deleted: false, body: {} }]);
    await s.push(B, [{ kind: "task", id: "t", baseRev: 0, deleted: false, body: {} }]);
    await s.wipe(A);
    expect((await s.pull(A, 0)).records).toEqual([]);
    expect(await s.getVault(A)).toBeNull();
    expect((await s.pull(B, 0)).records).toHaveLength(1);
  });
});
