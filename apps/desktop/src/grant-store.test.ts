import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LOCAL_GRANTS_FILE } from "@mandat/contract";
import { grantsFile, loadGrants, saveGrants } from "./grant-store.js";

// E9g A3 (D-373): the grants live only in the main process, in MANDAT_HOME/local-grants.json, written atomically with
// mode 0600. A broken or foreign file means no grants (fail closed), never a guess.
const dirs: string[] = [];
const tmp = () => {
  const d = realpathSync(mkdtempSync(path.join(os.tmpdir(), "mandat-grants-")));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const g = { path: "/w/shop", scopes: ["read", "apply"] as const, granted_at: "2026-10-24T01:00:00.000Z" };

describe("the grants file (D-373)", () => {
  it("lives in the profile folder under its contract name", () => {
    expect(grantsFile("/home/simo/h/.mandat")).toBe(path.join("/home/simo/h/.mandat", LOCAL_GRANTS_FILE));
  });

  it("no file yet → no grants; save then load round-trips", () => {
    const f = path.join(tmp(), "profile", LOCAL_GRANTS_FILE);
    expect(loadGrants(f)).toEqual({ grants: [], broken: false });
    saveGrants(f, [{ ...g, scopes: [...g.scopes] }]);
    expect(loadGrants(f)).toEqual({ grants: [{ ...g, scopes: ["read", "apply"] }], broken: false });
    expect(JSON.parse(readFileSync(f, "utf8"))).toEqual({ version: 1, grants: [{ ...g, scopes: ["read", "apply"] }] });
  });

  // D-373: POSIX file modes; Windows has none to check
  it.skipIf(process.platform === "win32")("the file is 0600 and its folder 0700, also when the file was wider before", () => {
    const d = path.join(tmp(), "profile");
    const f = path.join(d, LOCAL_GRANTS_FILE);
    saveGrants(f, []);
    expect(statSync(f).mode & 0o777).toBe(0o600);
    expect(statSync(d).mode & 0o777).toBe(0o700);
    chmodSync(f, 0o644);
    saveGrants(f, []);
    expect(statSync(f).mode & 0o777).toBe(0o600);
  });

  it("atomic: no temp file is left behind, and a save replaces the whole file", () => {
    const d = tmp();
    const f = path.join(d, LOCAL_GRANTS_FILE);
    saveGrants(f, [{ ...g, scopes: ["read"] }]);
    saveGrants(f, []);
    expect(readdirSync(d)).toEqual([LOCAL_GRANTS_FILE]);
    expect(loadGrants(f).grants).toEqual([]);
  });

  it("a broken, foreign or invalid file → no grants and broken = true (fail closed)", () => {
    const d = tmp();
    const f = path.join(d, LOCAL_GRANTS_FILE);
    for (const text of ["{", "[]", JSON.stringify({ version: 2, grants: [] }), JSON.stringify({ version: 1, grants: [{ ...g, path: "relative" }] })]) {
      writeFileSync(f, text);
      expect(loadGrants(f), text).toEqual({ grants: [], broken: true });
    }
  });

  it("saving an invalid grant throws and leaves the old file as it was", () => {
    const f = path.join(tmp(), LOCAL_GRANTS_FILE);
    saveGrants(f, [{ ...g, scopes: ["read"] }]);
    expect(() => saveGrants(f, [{ ...g, path: "relative", scopes: ["read"] }])).toThrow();
    expect(loadGrants(f).grants).toEqual([{ ...g, scopes: ["read"] }]);
    expect(existsSync(f)).toBe(true);
  });
});
