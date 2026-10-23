import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadGrants } from "./grant-store.js";
import { confirmText, localHandlers } from "./local-handlers.js";
import type { LocalDeps } from "./local-handlers.js";

// E9g A3 (AC-12.6, D-373): the bridge methods for local access. A fake disk (realpath/isDirectory), a real grants file.
const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup(o: { confirm?: boolean; run?: { code: number; stdout: string } } = {}) {
  const dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "mandat-lh-")));
  tmps.push(dir);
  const dirs = new Set(["/w/shop", "/w/shop/src", "/etc", "/home/simo"]);
  const files = new Set(["/w/shop/src/a.ts"]);
  const links: Record<string, string> = { "/w/link": "/w/shop" };
  const confirm = vi.fn((_t: string, _d: string) => Promise.resolve(o.confirm ?? true));
  const openExternal = vi.fn((_u: string) => Promise.resolve());
  const runNode = vi.fn((_a: string[]) => Promise.resolve(o.run ?? { code: 0, stdout: JSON.stringify({ ok: true, ref: "mandat/t_1-a1", head: "b".repeat(40), files: ["a.ts"] }) }));
  const deps: LocalDeps = {
    lang: "en",
    env: {
      platform: "linux",
      home: "/home/simo",
      mandatHome: path.join(dir, "home"),
      realpath: (p) => {
        const r = links[p] ?? p;
        if (!dirs.has(r) && !files.has(r)) throw new Error("ENOENT");
        return r;
      },
      isDirectory: (p) => dirs.has(p),
    },
    file: path.join(dir, "home", "local-grants.json"),
    confirm,
    openExternal,
    runNode,
    cliMain: "/repo/packages/cli/dist/main.js",
    now: () => new Date("2026-10-24T02:00:00.000Z"),
  };
  return { h: localHandlers(deps), deps, confirm, openExternal, runNode };
}

describe("local access over the bridge (AC-12.6, D-373)", () => {
  it("nothing is granted at first; grant asks natively with the scopes listed, stores the real path", async () => {
    const { h, deps, confirm } = setup();
    expect(await h.grantsList({})).toEqual({ ok: true, value: { grants: [] } });
    const r = await h.grant({ path: "/w/link", scopes: ["read", "apply"] });
    expect(r).toEqual({ ok: true, value: { grant: { path: "/w/shop", scopes: ["read", "apply"], granted_at: "2026-10-24T02:00:00.000Z" } } });
    expect(confirm).toHaveBeenCalledTimes(1);
    const detail = confirm.mock.calls[0]?.[1] ?? "";
    expect(detail).toContain("/w/shop");
    expect(detail).toContain("Read");
    expect(detail).toContain("Apply locally");
    expect(detail).not.toContain("Terminal");
    expect(loadGrants(deps.file).grants).toHaveLength(1);
  });

  it("Cancel in the native box → nothing stored; a refused folder never reaches the box", async () => {
    const c = setup({ confirm: false });
    expect(await c.h.grant({ path: "/w/shop", scopes: ["read"] })).toEqual({ ok: false, error: { code: "cancelled", message: "Not granted." } });
    expect(loadGrants(c.deps.file).grants).toEqual([]);
    const s = setup();
    expect(await s.h.grant({ path: "/etc", scopes: ["read"] })).toMatchObject({ ok: false, error: { code: "denied", message: "System folders cannot be granted." } });
    expect(await s.h.grant({ path: "/home/simo", scopes: ["read"] })).toMatchObject({ ok: false, error: { code: "denied" } });
    expect(s.confirm).not.toHaveBeenCalled();
  });

  it("revoke a scope, then the folder", async () => {
    const { h } = setup();
    await h.grant({ path: "/w/shop", scopes: ["read", "apply"] });
    expect(await h.revoke({ path: "/w/shop", scopes: ["apply"] })).toMatchObject({ ok: true, value: { grants: [{ path: "/w/shop", scopes: ["read"] }] } });
    expect(await h.revoke({ path: "/w/shop" })).toEqual({ ok: true, value: { grants: [] } });
    expect(await h.grantsList({})).toEqual({ ok: true, value: { grants: [] } });
  });

  it("Open in editor: only with open_editor, inside the grant, via the editor URL", async () => {
    const { h, openExternal } = setup();
    expect(await h.openInEditor({ path: "/w/shop/src/a.ts", editor: "vscode", line: 3 })).toMatchObject({ ok: false, error: { code: "not_granted" } });
    await h.grant({ path: "/w/shop", scopes: ["read"] });
    expect(await h.openInEditor({ path: "/w/shop/src/a.ts", editor: "vscode", line: 3 })).toMatchObject({ ok: false, error: { code: "not_granted", message: "The folder is granted, but not for this action." } });
    await h.grant({ path: "/w/shop", scopes: ["open_editor"] });
    expect(await h.openInEditor({ path: "/w/shop/src/a.ts", editor: "zed", line: 3 })).toEqual({ ok: true, value: {} });
    expect(openExternal).toHaveBeenCalledWith("zed://file/w/shop/src/a.ts:3");
    expect(await h.openInEditor({ path: "/w/shop/src/missing.ts", editor: "zed" })).toMatchObject({ ok: false, error: { code: "failed" } });
    expect(openExternal).toHaveBeenCalledTimes(1);
  });

  it("Apply locally: only with apply; runs the CLI's apply on the real path and maps its answer", async () => {
    const { h, runNode } = setup();
    expect(await h.applyLocal({ task_id: "t_1", path: "/w/shop" })).toMatchObject({ ok: false, error: { code: "not_granted" } });
    expect(runNode).not.toHaveBeenCalled();
    await h.grant({ path: "/w/shop", scopes: ["apply"] });
    expect(await h.applyLocal({ task_id: "t_1", path: "/w/link" })).toEqual({ ok: true, value: { status: "applied", head: "b".repeat(40) } });
    expect(runNode).toHaveBeenCalledWith(["/repo/packages/cli/dist/main.js", "--json", "apply", "--task", "t_1", "--repo", "/w/shop"]);
  });

  it("a broken grants file → every use refused with the reason; a new grant replaces it", async () => {
    const { h, deps } = setup();
    await h.grant({ path: "/w/shop", scopes: ["apply"] });
    writeFileSync(deps.file, "{ broken");
    expect(await h.applyLocal({ task_id: "t_1", path: "/w/shop" })).toMatchObject({ ok: false, error: { code: "not_granted", message: expect.stringContaining("could not be read") } });
    expect(await h.grantsList({})).toEqual({ ok: true, value: { grants: [] } });
    await h.grant({ path: "/w/shop", scopes: ["read"] });
    expect(loadGrants(deps.file)).toMatchObject({ broken: false, grants: [{ scopes: ["read"] }] });
  });

  it("the confirmation text is in the chosen language", () => {
    expect(confirmText("bg", "/w/shop", ["terminal"]).detail).toContain("не в пясъчника");
    expect(confirmText("en", "/w/shop", ["read"]).title).toBe("Give the harness access to this folder?");
  });
});
