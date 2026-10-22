import { describe, expect, it } from "vitest";
import { FIXTURES, memView } from "./fixtures.test-helper.js";
import { propose, riskProfile, scanRepo } from "./index.js";

const withDirs = (extra: Record<string, string>) => scanRepo(memView({ ...FIXTURES["npm-vitest"], ...extra }));

describe("risk profile v1 by folder rules (E7г, AC-1.6)", () => {
  it("migrations/infra/deploy/.github/auth/payment/billing → high; src → medium; docs/README → low", () => {
    const s = withDirs({ "db/migrations/001.sql": "x", "infra/main.tf": "x", "src/auth/login.ts": "x", "src/billing/invoice.ts": "x", "docs/intro.md": "x" });
    const r = riskProfile(s);
    expect(r.high.map((h) => h.glob)).toEqual(["db/migrations/**", ".github/**", "infra/**", "src/auth/**", "src/billing/**"].sort());
    expect(r.high.find((h) => h.glob === "infra/**")?.rule).toBe("rule:infra");
    expect(r.medium).toEqual([{ glob: "src/**", rule: "rule:src" }]);
    expect(r.low.map((l) => l.glob)).toEqual(["README.md", "docs/**"]);
  });
  it("propose: high-risk folders are protected with source rule:<name>; high is capped at 1 with a second factor; bugfix over src is medium", () => {
    const p = propose(withDirs({ "infra/main.tf": "x", "src/payment/pay.ts": "x" }));
    expect(p.policy.protected_paths).toEqual(expect.arrayContaining(["infra/**", "src/payment/**"]));
    expect(p.field_sources["protected_paths.infra/**"]).toBe("rule:infra");
    expect(p.field_sources["protected_paths.src/payment/**"]).toBe("rule:payment");
    expect(p.policy.risk_classes.high).toEqual({ level_cap: 1, requires_second_factor: true });
    expect(p.policy.task_types.bugfix?.risk_class).toBe("medium");
    expect(p.policy.task_types.docs?.risk_class).toBe("low");
    expect(p.field_sources["task_types.bugfix.risk_class"]).toBe("rule:src");
  });
  it("baseline: flaky IDs go into tests.flaky (source baseline); 0 tests → risk cap 1 and a first task 'add tests'", () => {
    const s = withDirs({});
    const flaky = ["tests/cart.spec.ts > cart > total"];
    const p = propose(s, { baseline: { status: "ok", test_ids_count: 12, skipped: 0, duration_s: 4, report_valid: true, flaky } });
    expect(p.policy.tests.flaky).toEqual(flaky);
    expect(p.field_sources["tests.flaky"]).toBe("baseline");
    const z = propose(s, { baseline: { status: "ok", test_ids_count: 0, skipped: 0, duration_s: 1, report_valid: true, flaky: [] } });
    expect(z.risk_cap).toBe(1);
    expect(z.suggested_tasks[0]).toMatchObject({ type: "feature", title: expect.stringMatching(/tests/i) });
  });
  it("deterministic", () => {
    const s = withDirs({ "infra/main.tf": "x" });
    expect(propose(s).yaml).toBe(propose(s).yaml);
  });
});
