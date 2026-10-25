import { describe, expect, it } from "vitest";
import type { LocalGrant } from "@mandat/contract";
import { addGrant, authorize, checkGrantable, folderArgs, isInside, removeGrant } from "./local-access.js";
import type { PathEnv } from "./local-access.js";

// E9g A3 (AC-12.6, D-373): the desktop sees nothing on disk until a folder is granted; these checks decide every
// grant and every use. A fake file system: `links` are symlinks (resolved by realpath), `dirs` exist as folders,
// `files` exist as files.
function fakeEnv(o: { platform?: NodeJS.Platform; links?: Record<string, string>; dirs?: string[]; files?: string[]; home?: string; mandatHome?: string } = {}): PathEnv {
  const platform = o.platform ?? "linux";
  const links = o.links ?? {};
  const dirs = new Set(o.dirs ?? []);
  const files = new Set(o.files ?? []);
  const sep = platform === "win32" ? "\\" : "/";
  const resolve = (p: string): string => {
    for (const [from, to] of Object.entries(links)) if (p === from || p.startsWith(from + sep)) return resolve(to + p.slice(from.length));
    return p;
  };
  return {
    platform,
    home: o.home ?? "/home/simo",
    mandatHome: o.mandatHome ?? "/home/simo/code/harness/.mandat",
    realpath: (p) => {
      const r = resolve(p.length > 1 && p.endsWith(sep) && !/^[A-Za-z]:\\$/.test(p) ? p.slice(0, -1) : p);
      if (!dirs.has(r) && !files.has(r)) throw new Error("ENOENT");
      return r;
    },
    isDirectory: (p) => dirs.has(p),
  };
}

const grant = (p: string, scopes: LocalGrant["scopes"]): LocalGrant => ({ path: p, scopes, granted_at: "2026-10-24T01:00:00.000Z" });

describe("granting a folder (AC-12.6, D-373)", () => {
  const env = fakeEnv({
    dirs: ["/", "/home", "/home/simo", "/home/simo/code", "/home/simo/code/shop", "/home/simo/.ssh", "/home/simo/.config/app", "/usr/local/src", "/etc", "/home/simo/code/harness/.mandat", "/home/simo/code/harness/.mandat/runs", "/srv/www", "/home/simo/code/harness"],
    files: ["/home/simo/code/shop/README.md"],
    links: { "/home/simo/code/escape": "/etc", "/home/simo/code/shop-link": "/home/simo/code/shop", "/home/simo/code/to-home": "/home/simo" },
  });

  it("a project folder is granted with its real path", () => {
    expect(checkGrantable("/home/simo/code/shop", env)).toEqual({ ok: true, path: "/home/simo/code/shop" });
    expect(checkGrantable("/home/simo/code/shop-link", env)).toEqual({ ok: true, path: "/home/simo/code/shop" });
    expect(checkGrantable("/srv/www", env)).toEqual({ ok: true, path: "/srv/www" });
    expect(checkGrantable("/home/simo/code/harness", env)).toEqual({ ok: true, path: "/home/simo/code/harness" }); // the profile's parent is fine
  });

  it('"/", the home folder, its ancestors and a symlink to them are refused', () => {
    expect(checkGrantable("/", env)).toEqual({ ok: false, reason: "root" });
    expect(checkGrantable("/home/simo", env)).toEqual({ ok: false, reason: "home" });
    expect(checkGrantable("/home/simo/", env)).toEqual({ ok: false, reason: "home" });
    expect(checkGrantable("/home", env)).toEqual({ ok: false, reason: "home" });
    expect(checkGrantable("/home/simo/code/to-home", env)).toEqual({ ok: false, reason: "home" });
  });

  it("system folders, and a symlink that escapes into one, are refused", () => {
    expect(checkGrantable("/etc", env)).toEqual({ ok: false, reason: "system" });
    expect(checkGrantable("/usr/local/src", env)).toEqual({ ok: false, reason: "system" });
    expect(checkGrantable("/home/simo/code/escape", env)).toEqual({ ok: false, reason: "system" });
  });

  it("E9g review: a folder that holds a system folder (/var above /var/lib, /private above /private/etc) is refused too", () => {
    const linux = fakeEnv({ dirs: ["/var", "/var/www", "/var/lib"] });
    expect(checkGrantable("/var", linux)).toEqual({ ok: false, reason: "system" });
    expect(checkGrantable("/var/www", linux)).toEqual({ ok: true, path: "/var/www" });
    const mac = fakeEnv({ platform: "darwin", home: "/Users/simo", mandatHome: "/Users/simo/h/.mandat", dirs: ["/private", "/private/var", "/private/tmp/x"], links: { "/var": "/private/var" } });
    expect(checkGrantable("/private", mac)).toEqual({ ok: false, reason: "system" });
    expect(checkGrantable("/var", mac)).toEqual({ ok: false, reason: "system" });
    expect(checkGrantable("/PRIVATE/var", fakeEnv({ platform: "darwin", home: "/Users/simo", dirs: ["/PRIVATE/var"] }))).toEqual({ ok: false, reason: "system" });
    expect(checkGrantable("/private/tmp/x", mac)).toEqual({ ok: true, path: "/private/tmp/x" });
  });

  it("secrets folders in home and the harness profile (MANDAT_HOME) are refused", () => {
    expect(checkGrantable("/home/simo/.ssh", env)).toEqual({ ok: false, reason: "secrets" });
    expect(checkGrantable("/home/simo/.config/app", env)).toEqual({ ok: false, reason: "secrets" });
    expect(checkGrantable("/home/simo/code/harness/.mandat", env)).toEqual({ ok: false, reason: "profile" });
    expect(checkGrantable("/home/simo/code/harness/.mandat/runs", env)).toEqual({ ok: false, reason: "profile" });
  });

  it("a missing path or a file is refused", () => {
    expect(checkGrantable("/home/simo/code/nope", env)).toEqual({ ok: false, reason: "missing" });
    expect(checkGrantable("/home/simo/code/shop/README.md", env)).toEqual({ ok: false, reason: "not_a_folder" });
  });

  it("macOS: /System, /Library, ~/Library and a different letter case are refused", () => {
    const mac = fakeEnv({ platform: "darwin", home: "/Users/simo", mandatHome: "/Users/simo/h/.mandat", dirs: ["/System/Volumes", "/Library/x", "/Users/simo/Library/Keychains", "/USERS/SIMO", "/Users", "/Users/simo/code"] });
    expect(checkGrantable("/System/Volumes", mac)).toEqual({ ok: false, reason: "system" });
    expect(checkGrantable("/Library/x", mac)).toEqual({ ok: false, reason: "system" });
    expect(checkGrantable("/Users/simo/Library/Keychains", mac)).toEqual({ ok: false, reason: "secrets" });
    expect(checkGrantable("/USERS/SIMO", mac)).toEqual({ ok: false, reason: "home" });
    expect(checkGrantable("/Users", mac)).toEqual({ ok: false, reason: "home" });
    expect(checkGrantable("/Users/simo/code", mac)).toEqual({ ok: true, path: "/Users/simo/code" });
  });

  it("Windows: a drive root, C:\\Windows, Program Files, the profile folder and AppData are refused", () => {
    const win = fakeEnv({ platform: "win32", home: "C:\\Users\\simo", mandatHome: "C:\\Users\\simo\\h\\.mandat", dirs: ["C:\\", "D:\\", "C:\\Windows\\System32", "C:\\Program Files (x86)\\x", "C:\\Users\\simo", "C:\\Users\\simo\\AppData\\Roaming", "D:\\code\\shop", "c:\\programdata"] });
    expect(checkGrantable("C:\\", win)).toEqual({ ok: false, reason: "root" });
    expect(checkGrantable("D:\\", win)).toEqual({ ok: false, reason: "root" });
    expect(checkGrantable("C:\\Windows\\System32", win)).toEqual({ ok: false, reason: "system" });
    expect(checkGrantable("C:\\Program Files (x86)\\x", win)).toEqual({ ok: false, reason: "system" });
    expect(checkGrantable("c:\\programdata", win)).toEqual({ ok: false, reason: "system" });
    expect(checkGrantable("C:\\Users\\simo", win)).toEqual({ ok: false, reason: "home" });
    expect(checkGrantable("C:\\Users\\simo\\AppData\\Roaming", win)).toEqual({ ok: false, reason: "secrets" });
    expect(checkGrantable("D:\\code\\shop", win)).toEqual({ ok: true, path: "D:\\code\\shop" });
  });
});

describe("using a grant (AC-12.6, D-373)", () => {
  const env = fakeEnv({
    dirs: ["/w/shop", "/w/shop/src", "/w/shopping", "/w/other", "/etc"],
    files: ["/w/shop/src/a.ts", "/w/shopping/x.ts", "/w/other/b.ts", "/etc/passwd"],
    links: { "/w/shop/evil": "/etc", "/w/shop/src/b.ts": "/w/other/b.ts" },
  });
  const grants = [grant("/w/shop", ["read", "open_editor"])];

  it("a file inside a granted folder with the scope is allowed (its real path)", () => {
    expect(authorize("/w/shop/src/a.ts", "open_editor", grants, env)).toMatchObject({ ok: true, path: "/w/shop/src/a.ts" });
    expect(authorize("/w/shop", "read", grants, env)).toMatchObject({ ok: true, path: "/w/shop" });
  });

  it("without the scope, outside every grant, a sibling with the same prefix or a symlink out → refused", () => {
    expect(authorize("/w/shop", "apply", grants, env)).toEqual({ ok: false, reason: "no_scope" });
    expect(authorize("/w/shop", "terminal", grants, env)).toEqual({ ok: false, reason: "no_scope" });
    expect(authorize("/w/other/b.ts", "open_editor", grants, env)).toEqual({ ok: false, reason: "not_granted" });
    expect(authorize("/w/shopping/x.ts", "open_editor", grants, env)).toEqual({ ok: false, reason: "not_granted" });
    expect(authorize("/w/shop/evil/passwd", "open_editor", grants, env)).toEqual({ ok: false, reason: "not_granted" });
    expect(authorize("/w/shop/src/b.ts", "open_editor", grants, env)).toEqual({ ok: false, reason: "not_granted" });
    expect(authorize("/w/shop/../other/b.ts", "open_editor", grants, fakeEnv({ files: ["/w/shop/../other/b.ts"] }))).toEqual({ ok: false, reason: "not_granted" });
    expect(authorize("/w/shop/missing.ts", "open_editor", grants, env)).toEqual({ ok: false, reason: "missing" });
    expect(authorize("/w/shop/src/a.ts", "open_editor", [], env)).toEqual({ ok: false, reason: "not_granted" });
  });

  it("E9g review: a stored grant whose folder may not be granted (a hand-edited or older file: /, home, /etc) gives nothing", () => {
    const e = fakeEnv({ dirs: ["/", "/home/simo", "/etc", "/w/shop"], files: ["/etc/passwd", "/home/simo/notes.txt", "/w/shop/a.ts"] });
    expect(authorize("/etc/passwd", "open_editor", [grant("/", ["open_editor"])], e)).toEqual({ ok: false, reason: "not_granted" });
    expect(authorize("/home/simo/notes.txt", "open_editor", [grant("/home/simo", ["open_editor"])], e)).toEqual({ ok: false, reason: "not_granted" });
    expect(authorize("/etc/passwd", "open_editor", [grant("/etc", ["open_editor"])], e)).toEqual({ ok: false, reason: "not_granted" });
    expect(authorize("/w/shop/a.ts", "open_editor", [grant("/", ["open_editor"]), grant("/w/shop", ["open_editor"])], e)).toMatchObject({ ok: true, grant: { path: "/w/shop" } });
  });

  it("nested grants: the scope may come from either", () => {
    const g = [grant("/w/shop", ["read"]), grant("/w/shop/src", ["apply"])];
    expect(authorize("/w/shop/src/a.ts", "apply", g, env)).toMatchObject({ ok: true, grant: { path: "/w/shop/src" } });
    expect(authorize("/w/shop/src/a.ts", "read", g, env)).toMatchObject({ ok: true, grant: { path: "/w/shop" } });
  });

  it("isInside works by whole segments", () => {
    expect(isInside("/a/b", "/a/b", "linux")).toBe(true);
    expect(isInside("/a/b/c", "/a/b", "linux")).toBe(true);
    expect(isInside("/a/bc", "/a/b", "linux")).toBe(false);
    expect(isInside("/a", "/a/b", "linux")).toBe(false);
    expect(isInside("D:\\x\\y", "D:\\x", "win32")).toBe(true);
    expect(isInside("E:\\x", "D:\\x", "win32")).toBe(false);
  });
});

describe("changing grants (D-373)", () => {
  const now = new Date("2026-10-24T02:00:00.000Z");
  it("adding merges scopes on the same folder, in a fixed order, newest time", () => {
    const a = addGrant([], "/w/shop", ["apply", "read"], now);
    expect(a.grant).toEqual({ path: "/w/shop", scopes: ["read", "apply"], granted_at: now.toISOString() });
    const b = addGrant(a.grants, "/w/shop", ["open_editor", "read"], new Date("2026-10-24T03:00:00.000Z"));
    expect(b.grants).toEqual([{ path: "/w/shop", scopes: ["read", "apply", "open_editor"], granted_at: "2026-10-24T03:00:00.000Z" }]);
    expect(addGrant(b.grants, "/a", ["read"], now).grants.map((g) => g.path)).toEqual(["/a", "/w/shop"]);
  });
  it("revoking a scope keeps the rest; the last scope or no scopes forgets the folder", () => {
    const g = [grant("/w/shop", ["read", "apply"]), grant("/w/x", ["read"])];
    expect(removeGrant(g, "/w/shop", ["apply"])).toEqual([grant("/w/shop", ["read"]), grant("/w/x", ["read"])]);
    expect(removeGrant(g, "/w/shop", ["apply", "read"])).toEqual([grant("/w/x", ["read"])]);
    expect(removeGrant(g, "/w/shop")).toEqual([grant("/w/x", ["read"])]);
    expect(removeGrant(g, "/nope")).toEqual(g);
  });
});

describe('"Open with" arguments (AC-12.6)', () => {
  it("only absolute paths that are not flags, programs or the app itself", () => {
    expect(folderArgs(["/Applications/Harness.app/Contents/MacOS/Harness", "/Users/simo/shop", "--inspect", "relative", "/x/app.asar", "/repo/apps/desktop"], "darwin", ["/repo/apps/desktop"])).toEqual(["/Users/simo/shop"]);
    expect(folderArgs(["C:\\Harness\\Harness.exe", "D:\\code\\shop", "C:\\Harness\\Harness.exe"], "win32", [])).toEqual(["D:\\code\\shop"]);
    expect(folderArgs(["electron"], "linux", [])).toEqual([]);
  });
});
