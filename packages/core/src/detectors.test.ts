import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ChangedFile, Evidence, ParsedReport, RepoConfig, TestStatus } from "@mandat/contract";
import { buildReasons, d1, d10Lockfile, d2, d3, d3CoveredPaths, d4, decideVerdict, ev, mustPass } from "./index.js";

const M = "tests/cart.spec.ts > cart > applies 10% over 50";
const EX50 = "tests/cart.spec.ts > cart > no discount at exactly 50";
const cartTitles = ["empty cart has zero subtotal", "subtotal sums price times qty", "ignores items with qty 0", "rejects negative qty", "rejects negative price", "no discount under 50", "no discount at exactly 50", "applies 10% over 50", "rounds discount down to whole cents", "total is subtotal minus discount", "large cart total", "discount is never negative"];
const moneyTitles = ["formats cents as euros", "formats zero", "formats negative", "parses euros string", "parses integer euros", "rejects invalid string", "adds cents", "multiplies cents by qty"];
const IDS = [...cartTitles.map((t) => `tests/cart.spec.ts > cart > ${t}`), ...moneyTitles.map((t) => `tests/money.spec.ts > money > ${t}`)];
const rep = (over: Record<string, TestStatus | null> = {}, success?: boolean): ParsedReport => {
  const tests = new Map<string, TestStatus>();
  for (const id of IDS) {
    const s = id in over ? over[id] : "passed";
    if (s !== null && s !== undefined) tests.set(id, s);
  }
  for (const [id, s] of Object.entries(over)) if (!IDS.includes(id) && s) tests.set(id, s);
  return { valid: true, success: success ?? [...tests.values()].every((s) => s !== "failed"), total: tests.size, tests };
};
const B0 = rep({ [M]: "failed" });
const ALL = rep();
const rc = (JSON.parse(readFileSync(new URL("../../../contracts/fix-discount.json", import.meta.url), "utf8")) as { repo_config: RepoConfig }).repo_config;
const snap = (files: Record<string, string>) => ({ get: (p: string) => (p in files ? Buffer.from(files[p] ?? "") : null) });
const file = (path: string, status: ChangedFile["status"] = "M", old_path?: string): ChangedFile => ({ path, status, bytes: 1, binary: false, ...(old_path ? { old_path } : {}) });
const PKG = JSON.stringify({ name: "shop", scripts: { test: "vitest run" } }, null, 2);

describe("D1", () => {
  it("pass, регресия, липсващ, невалиден, стар провал", () => {
    expect(d1(B0, ALL).evidence.status).toBe("pass");
    expect(d1(B0, rep({ [EX50]: "failed" })).evidence.signature).toBe(`D1:regression:${EX50}`);
    expect(d1(B0, rep({ [EX50]: null })).evidence.status).toBe("fail");
    expect(d1(B0, { valid: false, error: "missing", detail: "" }).evidence.signature).toBe("D1:report_invalid:missing");
    expect(d1(B0, rep({ [M]: "failed" })).evidence.status).toBe("pass");
    const two = d1(B0, rep({ [EX50]: "failed", [IDS[0] ?? ""]: "skipped" }));
    expect(two.evidence.data.regressions).toEqual([IDS[0], EX50]);
  });
});

describe("D2", () => {
  const base = { baseline: B0, exitB: 0, diffPatch: "", mayChangeTests: false };
  it("липсващ / may_change_tests / skip / todo / нов тест", () => {
    expect(d2({ ...base, b: rep({ [M]: null }) }).evidence.signature).toBe(`D2:missing_test:${M}`);
    const u = d2({ ...base, b: rep({ [M]: null }), mayChangeTests: true });
    expect([u.evidence.status, u.evidence.signature]).toEqual(["unknown", `D2:missing_test:${M}`]);
    expect(d2({ ...base, b: rep({ [M]: "skipped" }) }).evidence.signature).toBe(`D2:skipped:${M}`);
    expect(d2({ ...base, b: rep({ [M]: "todo" }) }).evidence.status).toBe("fail");
    expect(d2({ ...base, b: rep({ "tests/new.spec.ts > new > x": "passed" }) }).evidence.status).toBe("pass");
  });
  it("only, zero, exit mismatch, невалиден", () => {
    const diff = (l: string) => `diff --git a/tests/cart.spec.ts b/tests/cart.spec.ts\n--- a/tests/cart.spec.ts\n+++ b/tests/cart.spec.ts\n@@ -1 +1 @@\n${l}\n`;
    expect(d2({ ...base, b: ALL, diffPatch: diff("+  it.only('x', () => {})") }).evidence.signature).toBe("D2:only:tests/cart.spec.ts");
    expect(d2({ ...base, b: ALL, diffPatch: diff("-  it.only('x', () => {})") }).evidence.status).toBe("pass");
    expect(d2({ ...base, b: ALL, diffPatch: "+++ b/x.only(\n" }).evidence.status).toBe("pass");
    expect(d2({ ...base, b: { valid: true, success: true, total: 0, tests: new Map() } }).evidence.signature).toBe("D2:zero_tests:-");
    expect(d2({ ...base, b: ALL, exitB: 1 }).evidence.signature).toBe("D2:exit_mismatch:-");
    expect(d2({ ...base, b: { valid: false, error: "duplicate_id", detail: "" } }).evidence.signature).toBe("D2:report_invalid:duplicate_id");
  });
  it("only печели пред missing (D-103)", () => {
    const cartIds = IDS.filter((i) => i.startsWith("tests/cart"));
    const b = rep(Object.fromEntries(cartIds.map((i) => [i, null])));
    const diffPatch = "+++ b/tests/cart.spec.ts\n+  it.only('applies 10% over 50', () => {\n";
    const r = d2({ ...base, b, diffPatch });
    expect(r.evidence.signature).toBe("D2:only:tests/cart.spec.ts");
    const f = r.evidence.data.findings as { cls: string }[];
    expect(f.filter((x) => x.cls === "only")).toHaveLength(1);
    expect(f.filter((x) => x.cls === "missing_test")).toHaveLength(12);
    expect(d2({ ...base, b, diffPatch, mayChangeTests: true }).evidence.signature).toBe("D2:only:tests/cart.spec.ts");
    const onlyMissing = d2({ ...base, b, mayChangeTests: true });
    expect([onlyMissing.evidence.status, onlyMissing.evidence.signature]).toEqual(["unknown", `D2:missing_test:${cartIds[0]}`]);
  });
});

describe("D3 / D4", () => {
  const base = snap({ "package.json": PKG });
  it("protected path, json поле, незащитено поле, config клас, .gitattributes, няколко", () => {
    expect(d3({ files: [file("vitest.config.ts")], base, head: base, rc }).evidence.signature).toBe("D3:protected_path:vitest.config.*");
    const echo = snap({ "package.json": PKG.replace("vitest run", "echo PASS") });
    expect(d3({ files: [file("package.json")], base, head: echo, rc }).evidence.signature).toBe("D3:protected_field:package.json#scripts");
    const desc = snap({ "package.json": JSON.stringify({ name: "shop", description: "x", scripts: { test: "vitest run" } }) });
    expect(d3({ files: [file("package.json")], base, head: desc, rc }).evidence.status).toBe("pass");
    const covered = d3CoveredPaths([file("package.json")], rc, base, desc);
    expect(d4({ files: [file("package.json")], allowedPaths: ["src/**"], coveredByD3: covered }).evidence.signature).toBe("D4:out_of_contract:package.json");
    const cfg = d3({ files: [file(".claude/settings.json", "A")], base, head: base, rc });
    expect([cfg.evidence.status, cfg.security.length, cfg.security[0]?.kind]).toEqual(["unknown", 1, "config_path_change"]);
    expect(d3({ files: [file(".gitattributes", "A")], base, head: base, rc }).evidence.status).toBe("unknown");
    const many = d3({ files: [file("package.json"), file("vitest.config.ts")], base, head: echo, rc });
    expect(many.evidence.signature).toBe("D3:protected_field:package.json#scripts");
    expect(many.evidence.data.findings).toHaveLength(2);
    const invalid = d3({ files: [file("package.json")], base, head: snap({ "package.json": "{" }), rc });
    expect(invalid.evidence.signature).toBe("D3:protected_json_invalid:package.json");
  });
  it("D4 и D4 пропуска D3", () => {
    const run = (files: ChangedFile[]) => d4({ files, allowedPaths: ["src/**"], coveredByD3: d3CoveredPaths(files, rc, base, base) }).evidence;
    expect(run([file("scripts/deploy.ts", "A")]).signature).toBe("D4:out_of_contract:scripts/**");
    expect(run([file("README.md")]).signature).toBe("D4:out_of_contract:README.md");
    expect(run([file("src/a.ts")]).status).toBe("pass");
    expect(run([file("lib/a.ts", "R", "src/a.ts")]).signature).toBe("D4:out_of_contract:lib/**");
    const m = run([file("scripts/x.ts"), file("README.md"), file("scripts/y.ts")]);
    expect([m.signature, m.data.paths]).toEqual(["D4:out_of_contract:scripts/**", ["scripts/**", "README.md"]]);
    expect(run([file(".claude/settings.json", "A")]).status).toBe("pass");
  });
});

describe("D10, MUST_PASS", () => {
  it("lockfile", () => {
    expect(d10Lockfile({ baseLock: null, headLock: null }).evidence.status).toBe("n/a");
    const lock = Buffer.from(JSON.stringify({ lockfileVersion: 3, packages: { "": {} } }));
    expect(d10Lockfile({ baseLock: lock, headLock: lock }).evidence.status).toBe("n/a");
    const evil = Buffer.from(JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/x": { resolved: "https://evil.example/x.tgz", integrity: "sha512-x" } } }));
    expect(d10Lockfile({ baseLock: lock, headLock: evil }).evidence.signature).toBe("D10:lockfile:foreign_resolved");
    expect(d10Lockfile({ baseLock: lock, headLock: Buffer.from("{") }).evidence.signature).toBe("D10:lockfile:not_v3");
    const ok2 = Buffer.from(JSON.stringify({ lockfileVersion: 3, packages: { "": {}, "node_modules/a": { resolved: "https://registry.npmjs.org/a/-/a-1.tgz", integrity: "sha512-" + "a".repeat(86) + "==" } } }));
    expect(d10Lockfile({ baseLock: lock, headLock: ok2 }).evidence.status).toBe("pass");
  });
  it("MUST_PASS", () => {
    expect(mustPass({ ids: [M], a: ALL, b: ALL }).evidence.status).toBe("pass");
    expect(mustPass({ ids: [M], a: ALL, b: B0 }).evidence.signature).toBe(`MUST_PASS:not_passed:${M}`);
    expect(mustPass({ ids: [M], a: ALL, b: { valid: false, error: "missing", detail: "" } }).evidence.status).toBe("fail");
  });
});

describe("verdict", () => {
  const p = ev("EXPORT", "pass", "ok");
  const u = ev("D3.protected", "unknown", "x", {}, { cls: "protected_path", id: "g" });
  const f = ev("D4.contract", "fail", "x", {}, { cls: "out_of_contract", id: "a/**" });
  const n = ev("D10.lockfile", "n/a", "n/a");
  it("decideVerdict", () => {
    expect(decideVerdict([p, p])).toBe("VERIFIED");
    expect(decideVerdict([p, u])).toBe("UNKNOWN");
    expect(decideVerdict([p, u, f])).toBe("FAILED");
    expect(decideVerdict([n, p])).toBe("VERIFIED");
    expect(() => decideVerdict([])).toThrow();
  });
  it("reasons ред (D-039)", () => {
    expect(buildReasons([u, f], [])).toEqual(["D4:out_of_contract:a/**", "D3:protected_path:g"]);
    const e1 = ev("EXPORT", "fail", "x", {}, { cls: "symlink", id: "src/x" });
    expect(buildReasons([e1], ["export:symlink", "export:symlink", "export:hardlink"])).toEqual(["export:symlink", "export:hardlink", "EXPORT:symlink:src/x"]);
    expect(buildReasons([ev("INFRA", "unknown", "x", {}, { cls: "INSTALL_BASE", id: "-" })], ["infra:install_base"])).toEqual(["infra:install_base", "INFRA:INSTALL_BASE:-"]);
    expect(buildReasons([ev("AGENT", "unknown", "x", {}, { cls: "timeout", id: "-" })], ["agent:timeout"])).toEqual(["agent:timeout", "AGENT:timeout:-"]);
  });
  const rank = { VERIFIED: 2, UNKNOWN: 1, FAILED: 0 } as const;
  const evArb = fc.constantFrom<Evidence>(p, u, f, n);
  it("property: монотонност", () => {
    fc.assert(fc.property(fc.array(evArb, { minLength: 1 }), (es) => {
      expect(rank[decideVerdict([...es, f])]).toBeLessThanOrEqual(rank[decideVerdict(es)]);
    }), { numRuns: 300 });
  });
  it("property: VERIFIED ⇒ няма fail/unknown", () => {
    fc.assert(fc.property(fc.array(evArb, { minLength: 1 }), (es) => {
      if (decideVerdict(es) === "VERIFIED") expect(es.every((e) => e.status === "pass" || e.status === "n/a")).toBe(true);
    }), { numRuns: 300 });
  });
});
