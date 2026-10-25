import { describe, expect, it } from "vitest";
import { DEFAULT_LICENSES, d8Static } from "./d8.js";

// v5 E9б (5.2): D8 — the project's lint and typecheck on base and on tree B (only when they pass on base), and the
// dependencies the change adds (license outside the allowlist or younger than 3 days → a human decides).
const NOW = Date.parse("2026-10-23T12:00:00Z");
const day = 86_400_000;

describe("D8 static (E9б)", () => {
  it("nothing configured, nothing added → n/a", () => {
    expect(d8Static({ checks: [], deps: [], now: NOW }).evidence.status).toBe("n/a");
  });
  it("lint/typecheck: pass on base and B → pass; fail on B → fail D8:lint_fail / type_fail; fail on base → not counted", () => {
    expect(d8Static({ checks: [{ name: "lint", base: 0, b: 0 }, { name: "typecheck", base: 0, b: 0 }], deps: [], now: NOW }).evidence).toMatchObject({ status: "pass" });
    expect(d8Static({ checks: [{ name: "lint", base: 0, b: 1 }], deps: [], now: NOW }).evidence).toMatchObject({ status: "fail", signature: "D8:lint_fail:-" });
    expect(d8Static({ checks: [{ name: "lint", base: 0, b: 0 }, { name: "typecheck", base: 0, b: 2 }], deps: [], now: NOW }).evidence).toMatchObject({ status: "fail", signature: "D8:type_fail:-" });
    const baseRed = d8Static({ checks: [{ name: "typecheck", base: 1, b: 1 }], deps: [], now: NOW }).evidence;
    expect(baseRed).toMatchObject({ status: "pass" });
    expect(baseRed.data).toMatchObject({ skipped: ["typecheck"] });
    expect(d8Static({ checks: [{ name: "lint", base: 0, b: null }], deps: [], now: NOW }).evidence).toMatchObject({ status: "unknown", signature: "D8:timeout:lint" });
  });
  it("a new dependency: license outside the allowlist or younger than 3 days → unknown D8:dependency:<name>; unknown facts → unknown too", () => {
    expect(DEFAULT_LICENSES).toContain("MIT");
    const ok = { name: "left-pad", version: "1.3.0", license: "MIT", published_at: new Date(NOW - 400 * day).toISOString() };
    expect(d8Static({ checks: [], deps: [ok], now: NOW }).evidence.status).toBe("pass");
    expect(d8Static({ checks: [], deps: [{ ...ok, license: "AGPL-3.0-only" }], now: NOW }).evidence).toMatchObject({ status: "unknown", signature: "D8:dependency:left-pad" });
    expect(d8Static({ checks: [], deps: [{ ...ok, published_at: new Date(NOW - 2 * day).toISOString() }], now: NOW }).evidence.data).toMatchObject({ dependencies: [{ name: "left-pad", why: "younger than 3 days" }] });
    expect(d8Static({ checks: [], deps: [{ ...ok, license: null, published_at: null }], now: NOW }).evidence).toMatchObject({ status: "unknown", signature: "D8:dependency:left-pad" });
    expect(d8Static({ checks: [], deps: [{ ...ok, license: "(MIT OR Apache-2.0)" }], now: NOW }).evidence.status).toBe("pass");
  });
  it("a failing check wins over a dependency question (fail before unknown)", () => {
    expect(d8Static({ checks: [{ name: "lint", base: 0, b: 1 }], deps: [{ name: "x", version: "1.0.0", license: "GPL-3.0-only", published_at: null }], now: NOW }).evidence.status).toBe("fail");
  });
});
