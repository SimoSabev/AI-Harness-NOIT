import { describe, expect, it } from "vitest";
import type { SyncRecord } from "@mandat/contract";
import { mergeBodies, planFirstSignIn, type LocalRecord } from "./merge.js";

const rec = (kind: SyncRecord["kind"], id: string, body: Record<string, unknown>, rev = 1): SyncRecord => ({ kind, id, rev, updatedAt: "2026-11-04T10:00:00.000Z", deleted: false, body });
const loc = (kind: SyncRecord["kind"], id: string, body: Record<string, unknown>): LocalRecord => ({ kind, id, body, deleted: false });

describe("three-way merge (D-492)", () => {
  it("keeps both sides' changes to different fields", () => {
    const r = mergeBodies({ lang: "en", theme: "light" }, { lang: "bg", theme: "light" }, { lang: "en", theme: "dark" });
    expect(r.body).toEqual({ lang: "bg", theme: "dark" });
    expect(r.conflicts).toEqual([]);
  });

  it("the server wins a field both sides changed, and the loss is reported", () => {
    const r = mergeBodies({ theme: "light" }, { theme: "system" }, { theme: "dark" });
    expect(r.body).toEqual({ theme: "dark" });
    expect(r.conflicts).toEqual([{ field: "theme", local: "system", server: "dark" }]);
  });

  it("a field removed on one side and untouched on the other is removed", () => {
    expect(mergeBodies({ a: 1, b: 2 }, { a: 1 }, { a: 1, b: 2 }).body).toEqual({ a: 1 });
  });
});

describe("first sign-in moves local data (D-492)", () => {
  it("uploads what only this device has, downloads what only the server has, merges the rest", () => {
    const p = planFirstSignIn(
      [loc("prefs", "ui", { lang: "bg" }), loc("project", "shop", { name: "shop" }), loc("task", "t1", { title: "a" })],
      [rec("prefs", "ui", { lang: "en", theme: "dark" }, 4), rec("project", "site", { name: "site" }), rec("task", "t1", { title: "a" }, 2)],
    );
    expect(p.upload.map((c) => `${c.kind}/${c.id}`)).toEqual(["project/shop"]);
    expect(p.download.map((r) => `${r.kind}/${r.id}`)).toEqual(["project/site"]);
    // with no common base the server wins conflicting fields, the device's other fields survive
    expect(p.merged).toEqual([{ kind: "prefs", id: "ui", baseRev: 4, deleted: false, body: { lang: "en", theme: "dark" } }]);
    expect(p.conflicts).toEqual([{ kind: "prefs", id: "ui", field: "lang", local: "bg", server: "en" }]);
  });

  it("task history is append-only: an id on both sides keeps the server's copy, no change is pushed", () => {
    const p = planFirstSignIn([loc("task", "t1", { title: "local" })], [rec("task", "t1", { title: "server" }, 2)]);
    expect(p.merged).toEqual([]);
    expect(p.download).toEqual([]);
    expect(p.conflicts).toEqual([]);
  });

  it("an empty server receives everything", () => {
    const p = planFirstSignIn([loc("settings", "s", { a: 1 }), loc("mcp", "m", { url: "https://x" })], []);
    expect(p.upload).toHaveLength(2);
    expect(p.upload.every((c) => c.baseRev === 0)).toBe(true);
  });
});
