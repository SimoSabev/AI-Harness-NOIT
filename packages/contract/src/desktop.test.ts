import { describe, expect, it } from "vitest";
import {
  DESKTOP_EVENT_CHANNEL,
  DESKTOP_METHOD_NAMES,
  DesktopCommand,
  LocalGrant,
  LocalPath,
  desktopChannel,
  desktopMethodOf,
  parseDesktopRequest,
  parseDesktopResponse,
} from "./index.js";

// E9g A1 (D-371): the only messages between the Electron main process and the web UI.
describe("desktop bridge contract (D-371)", () => {
  it("one channel per method, all under harness:; anything else is not a desktop channel", () => {
    expect(DESKTOP_METHOD_NAMES).toEqual(["pickFolder", "grantsList", "grant", "revoke", "openInEditor", "applyLocal", "notify", "badge", "inboxCount"]);
    for (const m of DESKTOP_METHOD_NAMES) {
      expect(desktopChannel(m)).toBe(`harness:${m}`);
      expect(desktopMethodOf(desktopChannel(m))).toBe(m);
    }
    for (const bad of ["harness:exec", "harness:", "pickFolder", "harness:constructor", "harness:__proto__", DESKTOP_EVENT_CHANNEL, 1, null]) expect(desktopMethodOf(bad)).toBeNull();
  });

  it("LocalGrant: absolute path, 1..4 distinct scopes from the closed list, an ISO time; nothing extra", () => {
    const g = { path: "/Users/simo/code/shop", scopes: ["read", "apply"], granted_at: "2026-10-23T22:00:00.000Z" };
    expect(LocalGrant.parse(g)).toEqual(g);
    expect(LocalGrant.safeParse({ ...g, path: "C:\\Users\\simo\\shop" }).success).toBe(true);
    for (const bad of [
      { ...g, path: "code/shop" },
      { ...g, path: "/a\0b" },
      { ...g, path: `/${"a".repeat(4096)}` },
      { ...g, scopes: [] },
      { ...g, scopes: ["read", "read"] },
      { ...g, scopes: ["root"] },
      { ...g, granted_at: "yesterday" },
      { ...g, extra: 1 },
    ]) expect(LocalGrant.safeParse(bad).success, JSON.stringify(bad).slice(0, 80)).toBe(false);
    expect(LocalPath.safeParse("\\\\server\\share").success).toBe(false); // no UNC paths
  });

  it("requests are strict per method; unknown method or extra keys → invalid", () => {
    expect(parseDesktopRequest("pickFolder", {})).toEqual({ ok: true, value: {} });
    expect(parseDesktopRequest("grant", { path: "/w/shop", scopes: ["read"] }).ok).toBe(true);
    expect(parseDesktopRequest("revoke", { path: "/w/shop" }).ok).toBe(true);
    expect(parseDesktopRequest("openInEditor", { path: "/w/shop/src/a.ts", line: 12, editor: "vscode" }).ok).toBe(true);
    expect(parseDesktopRequest("applyLocal", { task_id: "t_01abc", path: "/w/shop" }).ok).toBe(true);
    expect(parseDesktopRequest("notify", { title: "Waiting for you", body: "t_1 needs approval", task_id: "t_1" }).ok).toBe(true);
    expect(parseDesktopRequest("badge", { count: 3 }).ok).toBe(true);
    expect(parseDesktopRequest("inboxCount", { count: 0 }).ok).toBe(true);
    const bad: [string, unknown][] = [
      ["pickFolder", { path: "/" }],
      ["grant", { path: "/w", scopes: ["sudo"] }],
      ["openInEditor", { path: "/w/a.ts", editor: "notepad" }],
      ["openInEditor", { path: "/w/a.ts", editor: "vscode", line: 0 }],
      ["applyLocal", { task_id: "../../etc", path: "/w" }],
      ["notify", { title: "x".repeat(121), body: "" }],
      ["badge", { count: -1 }],
      ["badge", { count: 1.5 }],
      ["inboxCount", "3"],
      ["exec", {}],
    ];
    for (const [m, p] of bad) expect(parseDesktopRequest(m, p), m).toEqual({ ok: false, error: { code: "invalid_request", message: expect.any(String) } });
  });

  it("responses are the envelope {ok, value} | {ok:false, error{code, message}} with the method's value", () => {
    expect(parseDesktopResponse("pickFolder", { ok: true, value: { path: null } })).toEqual({ ok: true, value: { path: null } });
    expect(parseDesktopResponse("grantsList", { ok: true, value: { grants: [] } }).ok).toBe(true);
    expect(parseDesktopResponse("notify", { ok: false, error: { code: "not_ready", message: "later" } })).toEqual({ ok: false, error: { code: "not_ready", message: "later" } });
    expect(parseDesktopResponse("applyLocal", { ok: true, value: { status: "applied", head: "a".repeat(40) } }).ok).toBe(true);
    for (const bad of [null, { ok: true }, { ok: true, value: { path: "relative" } }, { ok: false, error: { code: "boom", message: "" } }, { ok: true, value: { path: null }, x: 1 }])
      expect(parseDesktopResponse("pickFolder", bad).ok, JSON.stringify(bad)).toBe(false);
    expect(parseDesktopResponse("nope", { ok: true, value: {} })).toEqual({ ok: false, error: { code: "invalid_response", message: expect.any(String) } });
  });

  it("commands from main to the UI: menu items, project 1..9, open a task card", () => {
    for (const c of [{ command: "new_task" }, { command: "approve" }, { command: "view", view: "board" }, { command: "open_project", index: 9 }, { command: "open_task", task_id: "t_1" }])
      expect(DesktopCommand.safeParse(c).success, JSON.stringify(c)).toBe(true);
    for (const c of [{ command: "open_project", index: 10 }, { command: "view", view: "settings/../x" }, { command: "eval", code: "1" }, { command: "new_task", x: 1 }])
      expect(DesktopCommand.safeParse(c).success, JSON.stringify(c)).toBe(false);
  });
});
