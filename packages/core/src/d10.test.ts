import { describe, expect, it } from "vitest";
import { d10Lockfile } from "./d10.js";

// D-357 (bench B11): a dependency added to package.json without the lockfile is D10's (a reproducible install is part of
// the change), decided before any install — not an infrastructure failure of npm ci.
const pkg = (deps: Record<string, string>) => Buffer.from(JSON.stringify({ name: "shop", devDependencies: { vitest: "5.0.5" }, dependencies: deps }));
const lock = Buffer.from('{"lockfileVersion":3,"packages":{}}');

describe("D10 without the lockfile (D-357)", () => {
  it("dependencies changed, lockfile unchanged → fail lock_missing; unchanged → n/a; scripts only → n/a", () => {
    expect(d10Lockfile({ baseLock: lock, headLock: lock, basePkg: pkg({}), headPkg: pkg({ "left-pad": "1.3.0" }) }).evidence).toMatchObject({ status: "fail", signature: "D10:lock_missing:left-pad" });
    expect(d10Lockfile({ baseLock: lock, headLock: lock, basePkg: pkg({}), headPkg: pkg({}) }).evidence.status).toBe("n/a");
    const scripts = Buffer.from(JSON.stringify({ name: "shop", devDependencies: { vitest: "5.0.5" }, dependencies: {}, scripts: { test: "x" } }));
    expect(d10Lockfile({ baseLock: lock, headLock: lock, basePkg: pkg({}), headPkg: scripts }).evidence.status).toBe("n/a");
  });

  it("workspace (E8и): a dependency added in a package's package.json without the lockfile → fail with that path", () => {
    const sub = (deps: Record<string, string>) => Buffer.from(JSON.stringify({ name: "@shop/cart", dependencies: { "@shop/money": "workspace:*", ...deps } }));
    const r = d10Lockfile({ baseLock: lock, headLock: lock, basePkg: pkg({}), headPkg: pkg({}), manifests: [{ path: "packages/cart/package.json", base: sub({}), head: sub({ "left-pad": "1.3.0" }) }] });
    expect(r.evidence).toMatchObject({ status: "fail", signature: "D10:lock_missing:left-pad" });
    expect(r.evidence.data).toMatchObject({ packages: ["left-pad"], manifests: ["packages/cart/package.json"] });
    // a new workspace package with its own dependencies is the same
    expect(d10Lockfile({ baseLock: lock, headLock: lock, manifests: [{ path: "packages/new/package.json", base: null, head: sub({}) }] }).evidence.signature).toBe("D10:lock_missing:@shop/money");
    expect(d10Lockfile({ baseLock: lock, headLock: lock, manifests: [{ path: "packages/cart/package.json", base: sub({}), head: sub({}) }] }).evidence.status).toBe("n/a");
  });
});

describe("addedDependencies (E9б, D8)", () => {
  it("the dependencies a change adds or re-specifies, across every package.json; removals are not listed", async () => {
    const { addedDependencies } = await import("./d10.js");
    const p = (deps: Record<string, string>, dev: Record<string, string> = {}) => Buffer.from(JSON.stringify({ dependencies: deps, devDependencies: dev }));
    expect(addedDependencies([
      { path: "package.json", base: p({ a: "1.0.0", gone: "1.0.0" }), head: p({ a: "1.0.0", b: "^2.0.0" }, { c: "3.1.4" }) },
      { path: "packages/x/package.json", base: null, head: p({ a: "1.1.0" }) },
    ])).toEqual([{ name: "b", spec: "^2.0.0" }, { name: "c", spec: "3.1.4" }, { name: "a", spec: "1.1.0" }]);
    expect(addedDependencies([{ path: "package.json", base: p({}), head: p({ w: "workspace:*", l: "link:../l", f: "file:../f" }) }])).toEqual([]);
  });
});
