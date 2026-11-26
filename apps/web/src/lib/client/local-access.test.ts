import { describe, expect, it } from "vitest";
import { activityFor, addProjectHref, joinLocal, parseEditor, missingScopes, pickAndGrant, suggestProject } from "./local-access";

// E9g A3 (AC-12.6, D-373): the web half of local access — pure helpers for the "Add project" screen, Settings → Local
// access and the task's "Apply locally" / "Open in editor". Main checks every path again; these only shape requests.
describe("local access, web side (E9g A3)", () => {
  it("Add project: the path travels in the query, encoded; without a path the screen offers the folder dialog", () => {
    expect(addProjectHref()).toBe("/projects/add");
    expect(addProjectHref("/Users/simo/my shop")).toBe("/projects/add?path=%2FUsers%2Fsimo%2Fmy%20shop");
  });
  it("the suggestion: the folder's name and read only (the safe default); more scopes are opt-in", () => {
    expect(suggestProject("/Users/simo/code/shop/")).toEqual({ name: "shop", scopes: ["read"] });
    expect(suggestProject("D:\\code\\Shop")).toEqual({ name: "Shop", scopes: ["read"] });
  });
  it("the editor choice: vscode, cursor or zed; anything else falls back to vscode", () => {
    expect(parseEditor("zed")).toBe("zed");
    expect(parseEditor("cursor")).toBe("cursor");
    expect(parseEditor("emacs")).toBe("vscode");
    expect(parseEditor(null)).toBe("vscode");
  });
  it("a diff file inside the working copy: the folder's separator; no .., no absolute path", () => {
    expect(joinLocal("/w/shop", "src/a.ts")).toBe("/w/shop/src/a.ts");
    expect(joinLocal("/w/shop/", "src/a.ts")).toBe("/w/shop/src/a.ts");
    expect(joinLocal("D:\\code\\shop", "src/a.ts")).toBe("D:\\code\\shop\\src\\a.ts");
    for (const bad of ["../x", "src/../../x", "/etc/passwd", "C:\\x", "", "a\0b"]) expect(joinLocal("/w/shop", bad), bad).toBeNull();
  });
  it("what goes to task_activities: the outcome and a short detail, never the local folder", () => {
    expect(activityFor("local_apply", { ok: true, value: { status: "applied", head: "a".repeat(40) } })).toEqual({ kind: "local_apply", outcome: "applied", detail: "aaaaaaaaaaaa" });
    expect(activityFor("local_apply", { ok: true, value: { status: "refused", head: null, detail: "diverged: rebase" } })).toEqual({ kind: "local_apply", outcome: "refused", detail: "diverged: rebase" });
    expect(activityFor("local_editor", { ok: true, value: {} }, "src/a.ts")).toEqual({ kind: "local_editor", outcome: "opened", detail: "src/a.ts" });
    expect(activityFor("local_editor", { ok: false, error: { code: "not_granted", message: "no" } }, "src/a.ts")).toEqual({ kind: "local_editor", outcome: "failed", detail: "not_granted" });
    expect(activityFor("local_apply", { ok: false, error: { code: "cancelled", message: "x" } })).toBeNull(); // nothing happened
  });
});

// D-634 (Simo 26.11.2026, "това да го няма"): adding a project is one step — pick the folder, the desktop asks once in
// its own dialog, done. Read is all a project needs; apply, editor and terminal are granted later in Local access.
describe("pick and grant in one step (D-634)", () => {
  const ok = <V,>(value: V) => ({ ok: true as const, value });
  it("picks a folder, then grants read only, and gives the granted path", async () => {
    const calls: unknown[] = [];
    const b = { call: async (m: string, req: unknown) => (calls.push([m, req]), m === "pickFolder" ? ok({ path: "/Users/x/shop" }) : ok({ grant: { path: "/Users/x/shop", scopes: ["read"], granted_at: "t" } })) };
    expect(await pickAndGrant(b as never, null)).toEqual({ ok: true, path: "/Users/x/shop" });
    expect(calls).toEqual([["pickFolder", {}], ["grant", { path: "/Users/x/shop", scopes: ["read"] }]]);
  });
  it("a folder given (dropped, Open with) skips the picker; a cancelled picker grants nothing", async () => {
    const calls: string[] = [];
    const b = { call: async (m: string) => (calls.push(m), m === "pickFolder" ? ok({ path: null }) : ok({ grant: { path: "/d", scopes: ["read"], granted_at: "t" } })) };
    expect(await pickAndGrant(b as never, "/d")).toEqual({ ok: true, path: "/d" });
    expect(await pickAndGrant(b as never, null)).toEqual({ ok: false, cancelled: true });
    expect(calls).toEqual(["grant", "pickFolder"]);
  });
  it("a refused grant (the person said no in the dialog, or the folder is not allowed) is passed on", async () => {
    const no = { ok: false as const, error: { code: "cancelled", message: "no" } };
    const b = { call: async () => no };
    expect(await pickAndGrant(b as never, "/d")).toEqual({ ok: false, result: no });
  });
});

describe("more rights later, in Local access (D-634)", () => {
  it("lists the rights a folder does not have yet, in the usual order", () => {
    expect(missingScopes(["read"])).toEqual(["apply", "open_editor", "terminal"]);
    expect(missingScopes(["terminal", "read", "apply"])).toEqual(["open_editor"]);
    expect(missingScopes(["read", "apply", "open_editor", "terminal"])).toEqual([]);
  });
});
