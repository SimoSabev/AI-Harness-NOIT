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
});
