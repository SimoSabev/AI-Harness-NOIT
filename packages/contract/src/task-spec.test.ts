import { describe, expect, it } from "vitest";
import { AcceptanceCriterion, Handoff, OracleManifest, SessionSeal, Spec, WorkUnit, oracleHash, specHash, untestableCriteria } from "./index.js";

// Х0 (D-532, docs/prd/heavy-process.md §2–§8): spec with criteria, oracle, work unit, handoff and the session seal.
const H = (c: string) => `sha256:${c.repeat(64)}`;
const ac1 = { id: "AC-1", when: "a guest adds an item", shall: "show the cart total with VAT", proof: "tests" } as const;
const ac2 = { id: "AC-2", when: "the cart is empty", shall: "disable checkout", proof: "ui" } as const;
const spec = {
  goal: "A cart with VAT",
  product: "# Cart\nGuests see totals.",
  criteria: [ac1, ac2],
  unchanged: ["the login flow"],
  out_of_scope: ["payments"],
  profile: "feature",
} as const;

describe("acceptance criteria and spec (D-532)", () => {
  it("round-trips a spec", () => {
    expect(Spec.parse(spec)).toEqual(spec);
    expect(AcceptanceCriterion.parse(ac1)).toEqual(ac1);
  });
  it("rejects a bad id, an unknown proof, no criteria, a repeated id, extra keys", () => {
    expect(AcceptanceCriterion.safeParse({ ...ac1, id: "ac1" }).success).toBe(false);
    expect(AcceptanceCriterion.safeParse({ ...ac1, id: "AC-0" }).success).toBe(false);
    expect(AcceptanceCriterion.safeParse({ ...ac1, proof: "vibes" }).success).toBe(false);
    expect(Spec.safeParse({ ...spec, criteria: [] }).success).toBe(false);
    expect(Spec.safeParse({ ...spec, criteria: [ac1, { ...ac2, id: "AC-1" }] }).success).toBe(false);
    expect(Spec.safeParse({ ...spec, profile: "chat" }).success).toBe(false);
    expect(Spec.safeParse({ ...spec, approve: true }).success).toBe(false);
    expect(Spec.safeParse({ ...spec, goal: " " }).success).toBe(false);
  });
  it("specHash is stable over key order and changes with the content", () => {
    const reordered = { profile: spec.profile, out_of_scope: spec.out_of_scope, unchanged: spec.unchanged, criteria: [{ proof: "tests", shall: ac1.shall, when: ac1.when, id: "AC-1" }, ac2], product: spec.product, goal: spec.goal };
    expect(specHash(Spec.parse(spec))).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(specHash(Spec.parse(reordered))).toBe(specHash(Spec.parse(spec)));
    expect(specHash(Spec.parse({ ...spec, goal: "A cart without VAT" }))).not.toBe(specHash(Spec.parse(spec)));
  });
});

describe("untestableCriteria (D-532)", () => {
  it("a criterion with an empty or blank when/shall is untestable", () => {
    const s = Spec.parse({ ...spec, criteria: [ac1, { ...ac2, when: "  " }, { id: "AC-3", when: "x", shall: "", proof: "tests" }] });
    expect(untestableCriteria(s).map((c) => c.id)).toEqual(["AC-2", "AC-3"]);
  });
  it("proof human is untestable when the profile needs tests, fine for research and other", () => {
    const human = { id: "AC-3", when: "the owner reads the report", shall: "agree it is clear", proof: "human" } as const;
    expect(untestableCriteria(Spec.parse({ ...spec, criteria: [ac1, human] })).map((c) => c.id)).toEqual(["AC-3"]);
    expect(untestableCriteria(Spec.parse({ ...spec, profile: "research", criteria: [human] }))).toEqual([]);
    expect(untestableCriteria(Spec.parse({ ...spec, profile: "other", criteria: [human] }))).toEqual([]);
    expect(untestableCriteria(Spec.parse(spec))).toEqual([]);
  });
});

describe("oracle manifest (D-532)", () => {
  const manifest = {
    spec_hash: H("a"),
    hidden_tests: [{ path: "packages/engine/test/__hidden__/cart.test.ts", sha256: H("b") }],
    differential: { reference: "git:base", command: "pnpm diff-check" },
    e2e: ["guest checkout"],
    red_on_base: [{ criterion_id: "AC-1", red: true }],
  };
  it("round-trips; the optional parts may be absent", () => {
    expect(OracleManifest.parse(manifest)).toEqual(manifest);
    const bare = { spec_hash: H("a"), hidden_tests: [], red_on_base: [] };
    expect(OracleManifest.parse(bare)).toEqual(bare);
  });
  it("rejects an absolute or escaping test path, a bad hash, a bad approval time", () => {
    expect(OracleManifest.safeParse({ ...manifest, hidden_tests: [{ path: "/etc/x.test.ts", sha256: H("b") }] }).success).toBe(false);
    expect(OracleManifest.safeParse({ ...manifest, hidden_tests: [{ path: "../x.test.ts", sha256: H("b") }] }).success).toBe(false);
    // D-536: the paths are relative to the repo root and name a __hidden__ folder at any depth
    expect(OracleManifest.safeParse({ ...manifest, hidden_tests: [{ path: "acceptance/cart.test.ts", sha256: H("b") }] }).success).toBe(false);
    expect(OracleManifest.safeParse({ ...manifest, spec_hash: "abc" }).success).toBe(false);
    expect(OracleManifest.safeParse({ ...manifest, approved: { by: "simo", at: "yesterday" } }).success).toBe(false);
    expect(OracleManifest.safeParse({ ...manifest, red_on_base: [{ criterion_id: "X", red: true }] }).success).toBe(false);
  });
  it("oracleHash is stable over key order and ignores the approval", () => {
    const reordered = { red_on_base: manifest.red_on_base, e2e: manifest.e2e, differential: { command: "pnpm diff-check", reference: "git:base" }, hidden_tests: manifest.hidden_tests, spec_hash: manifest.spec_hash };
    const h = oracleHash(OracleManifest.parse(manifest));
    expect(oracleHash(OracleManifest.parse(reordered))).toBe(h);
    expect(oracleHash(OracleManifest.parse({ ...manifest, approved: { by: "simo", at: "2026-11-17T10:00:00.000Z" } }))).toBe(h);
    expect(oracleHash(OracleManifest.parse({ ...manifest, e2e: [] }))).not.toBe(h);
  });
});

describe("work unit, handoff, session seal (D-532)", () => {
  it("a work unit names its criteria, dependencies and status", () => {
    const u = { id: "u-cart-total", criteria: ["AC-1"], title: "Cart total", depends_on: [], status: "pending" };
    expect(WorkUnit.parse(u)).toEqual(u);
    expect(WorkUnit.safeParse({ ...u, status: "done" }).success).toBe(false);
    expect(WorkUnit.safeParse({ ...u, criteria: ["cart"] }).success).toBe(false);
    expect(WorkUnit.safeParse({ ...u, depends_on: ["u-cart-total"] }).success).toBe(false);
  });
  it("a handoff says what was done, deviations, risks and maybe the commit", () => {
    const h = { unit_id: "u-cart-total", done: "VAT added to the total", deviations: [], risks: ["rounding on refunds"], commit: "a".repeat(40) };
    expect(Handoff.parse(h)).toEqual(h);
    expect(Handoff.safeParse({ ...h, commit: "abc" }).success).toBe(false);
    expect(Handoff.safeParse({ ...h, done: "" }).success).toBe(false);
  });
  it("a seal binds spec, oracle, profile and the verdict; it says what was not checked", () => {
    const seal = { spec_hash: H("a"), oracle_hash: H("b"), profile: "feature", verdict: "VERIFIED", result_ref: "run_01", unchecked: ["performance under load"], ledger_head: H("c") };
    expect(SessionSeal.parse(seal)).toEqual(seal);
    const { ledger_head: _l, ...noHead } = seal;
    expect(SessionSeal.parse(noHead)).toEqual(noHead);
    expect(SessionSeal.safeParse({ ...seal, verdict: "PASS" }).success).toBe(false);
    expect(SessionSeal.safeParse({ ...seal, oracle_hash: "x" }).success).toBe(false);
  });
});
