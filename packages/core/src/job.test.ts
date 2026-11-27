import { describe, expect, it } from "vitest";
import { SessionSeal } from "@mandat/contract";
import type { PlanUnit, Spec } from "@mandat/contract";
import { failingCriteria, failingTitles, fileTags, sealable, unitLands, jobMode, oracleFilesFor, scopedOracleFiles, pilotSize, pilotUnits, sealFor, siteTable, uncheckedOf, unitWaves, unitsToStart, validatePlan, validateSites } from "./job.js";

// D-535: the plan check table, the oracle files a unit's tree B gets, failing criteria from D5, and the seal.
const spec: Spec = {
  goal: "g", product: "", unchanged: ["u"], out_of_scope: [], profile: "feature",
  criteria: [
    { id: "AC-1", when: "a", shall: "b", proof: "tests" },
    { id: "AC-2", when: "a", shall: "b", proof: "tests" },
    { id: "AC-3", when: "a", shall: "b", proof: "human" },
  ],
};
const u = (id: string, criteria: string[], depends_on: string[] = []): PlanUnit => ({ id, title: id, criteria, depends_on });

describe("validatePlan (D-535)", () => {
  const cases: [string, PlanUnit[], { kind: string; id: string }[]][] = [
    ["a good plan", [u("u1", ["AC-1"]), u("u2", ["AC-2", "AC-3"], ["u1"])], []],
    ["no units", [], [{ kind: "no_units", id: "-" }]],
    ["a criterion nobody covers", [u("u1", ["AC-1", "AC-2"])], [{ kind: "uncovered_criterion", id: "AC-3" }]],
    ["an unknown criterion", [u("u1", ["AC-1", "AC-2", "AC-3", "AC-9"])], [{ kind: "unknown_criterion", id: "u1:AC-9" }]],
    ["a repeated unit", [u("u1", ["AC-1", "AC-2"]), u("u1", ["AC-3"])], [{ kind: "duplicate_unit", id: "u1" }]],
    ["an unknown dependency", [u("u1", ["AC-1", "AC-2", "AC-3"], ["zz"])], [{ kind: "unknown_dependency", id: "u1->zz" }]],
    ["a dependency on a later unit", [u("u1", ["AC-1"], ["u2"]), u("u2", ["AC-2", "AC-3"])], [{ kind: "forward_dependency", id: "u1->u2" }]],
    ["a cycle", [u("u1", ["AC-1"], ["u2"]), u("u2", ["AC-2", "AC-3"], ["u1"])], [{ kind: "forward_dependency", id: "u1->u2" }, { kind: "cycle", id: "u1->u2->u1" }]],
  ];
  it.each(cases)("%s", (_name, units, problems) => {
    expect(validatePlan(spec, units)).toEqual(problems);
  });
});

describe("the oracle files of a unit (D-535)", () => {
  const f = (path: string, src: string) => ({ path, data: Buffer.from(src) });
  const files = [
    f("a.spec.ts", 'it("AC-1: x", () => {});'),
    f("b.spec.ts", 'test("AC-2: y", () => {});\nit.only("AC-1: z", () => {});'),
    f("u.spec.ts", "describe('U-1: stays', () => { it('works', () => {}); });"),
    f("none.spec.ts", 'it("plain", () => {});'),
  ];
  it("reads the tags of a file", () => {
    expect(fileTags(files[1]!.data.toString())).toEqual(["AC-1", "AC-2"]);
  });
  it("gets only files of the criteria done so far plus the unchanged ones; a file with a later criterion waits", () => {
    const r = oracleFilesFor(files, ["AC-1"]);
    expect(r.files.map((x) => x.path)).toEqual(["a.spec.ts", "u.spec.ts"]);
    expect(r.deferred).toEqual(["AC-1"]);
    expect(oracleFilesFor(files, ["AC-1", "AC-2"]).files.map((x) => x.path)).toEqual(["a.spec.ts", "b.spec.ts", "u.spec.ts"]);
  });
  it("D-574: a unit gets every file that has a test of its scope or an unchanged one (D5 decides on the scope only)", () => {
    expect(scopedOracleFiles(files, ["AC-1"]).map((x) => x.path)).toEqual(["a.spec.ts", "b.spec.ts", "u.spec.ts"]);
    expect(scopedOracleFiles(files, ["AC-9"]).map((x) => x.path)).toEqual(["u.spec.ts"]);
  });  it("D-536: oracle files at any depth (paths from the repo root) are filtered by their tags the same way", () => {
    const nested = [
      f("packages/engine/test/__hidden__/vec3.spec.ts", 'it("AC-1: adds", () => {});'),
      f("packages/ui/src/__hidden__/deep/b.spec.ts", 'it("AC-2: draws", () => {});'),
      f("tests/__hidden__/u.spec.ts", "describe('U-1: stays', () => {});"),
    ];
    expect(oracleFilesFor(nested, ["AC-1"]).files.map((x) => x.path)).toEqual(["packages/engine/test/__hidden__/vec3.spec.ts", "tests/__hidden__/u.spec.ts"]);
    expect(oracleFilesFor(nested, ["AC-1", "AC-2"]).files).toHaveLength(3);
  });
});

describe("failing criteria, unchecked and the seal (D-535)", () => {
  it("criterion ids from D5's failed tests; never a name", () => {
    const ev = [{ detector: "D5.hidden", status: "fail" as const, data: { failed: ["tests/__hidden__/b.spec.ts > AC-2: y", "tests/__hidden__/a.spec.ts > AC-10: x", "tests/__hidden__/u.spec.ts > U-1: stays", "plain"] } }];
    expect(failingCriteria(ev)).toEqual(["AC-2", "AC-10"]);
    expect(failingCriteria([{ detector: "D5.hidden", status: "pass", data: {} }])).toEqual([]);
  });
  it("the seal names criteria a person proves and checks that did not run", () => {
    const ev = [{ detector: "D5.hidden", status: "pass" as const }, { detector: "D11.oracle", status: "n/a" as const }, { detector: "D12.ui", status: "unknown" as const }];
    expect(uncheckedOf(spec, ev)).toEqual(["AC-3: proof by a person", "D11.oracle: not run", "D12.ui: not run"]);
    const s = sealFor({ spec, specHash: `sha256:${"a".repeat(64)}`, oracleHash: `sha256:${"b".repeat(64)}`, verdict: "VERIFIED", head: "c".repeat(40), evidence: ev, ledgerHead: `sha256:${"d".repeat(64)}` });
    expect(SessionSeal.parse(s)).toEqual({ spec_hash: `sha256:${"a".repeat(64)}`, oracle_hash: `sha256:${"b".repeat(64)}`, profile: "feature", verdict: "VERIFIED", result_ref: "c".repeat(40), unchecked: ["AC-3: proof by a person", "D11.oracle: not run", "D12.ui: not run"], ledger_head: `sha256:${"d".repeat(64)}` });
  });
});

// D-541 (М2 Х5/Х6): a team only where the work divides. The axes decide the mode; in waves mode every unit whose
// dependencies passed starts at once (each in its own task = its own copy), up to the limit.
describe("job mode and waves (D-541)", () => {
  const axes = (divisible: "yes" | "no" | "unknown") => ({ code: "existing", reference: "none", divisible, proof: ["tests"], risk: { level: "low", outward: false }, size: "m" }) as const;
  it("only work that divides runs in waves; unknown or no axes stay with one writer", () => {
    expect(jobMode(axes("yes"))).toBe("waves");
    expect(jobMode(axes("no"))).toBe("single");
    expect(jobMode(axes("unknown"))).toBe("single");
    expect(jobMode(null)).toBe("single");
  });
  it("the wave of a unit is one more than the latest wave it depends on", () => {
    expect(unitWaves([u("a", []), u("b", []), u("c", [], ["a"]), u("d", [], ["c", "b"])])).toEqual({ a: 0, b: 0, c: 1, d: 2 });
  });
  const s = (unit_id: string, ord: number, status: string, task_id: string | null, depends_on: string[] = []) => ({ unit_id, ord, status, task_id, depends_on });
  it("single: the first unit that has not passed, and only when it has no task yet", () => {
    expect(unitsToStart([s("a", 0, "passed", "t0"), s("b", 1, "pending", null), s("c", 2, "pending", null)], "single", 3)).toEqual(["b"]);
    expect(unitsToStart([s("a", 0, "running", "t0"), s("b", 1, "pending", null)], "single", 3)).toEqual([]);
  });
  it("waves: every pending unit whose dependencies passed, up to the free slots", () => {
    const us = [s("a", 0, "passed", "t0"), s("b", 1, "running", "t1"), s("c", 2, "pending", null, ["a"]), s("d", 3, "pending", null, ["b"]), s("e", 4, "pending", null), s("f", 5, "pending", null)];
    expect(unitsToStart(us, "waves", 3)).toEqual(["c", "e"]);
    expect(unitsToStart(us, "waves", 1)).toEqual([]);
    expect(unitsToStart(us, "waves", 9)).toEqual(["c", "e", "f"]);
  });
});

// D-545 (М2 Х5): a pilot on large work — the first units (closed under their dependencies) go first; the rest waits
// until the pilot passed and its lessons are written down.
describe("the pilot (D-545)", () => {
  it("size: none for small plans; 10% of the units, at least 3 and at most 10", () => {
    expect(pilotSize(3)).toBe(0);
    expect(pilotSize(5)).toBe(3);
    expect(pilotSize(60)).toBe(6);
    expect(pilotSize(400)).toBe(10);
  });
  it("the pilot units are the first ones whose dependencies are in the pilot too", () => {
    expect(pilotUnits([u("a", []), u("b", [], ["z"]), u("c", [], ["a"]), u("d", []), u("z", [])], 3)).toEqual(["a", "c", "d"]);
  });
  const s = (unit_id: string, ord: number, status: string, task_id: string | null, pilot: boolean) => ({ unit_id, ord, status, task_id, depends_on: [], pilot });
  it("while the pilot runs only pilot units start; after it, all", () => {
    const us = [s("a", 0, "passed", "t", true), s("b", 1, "pending", null, true), s("c", 2, "pending", null, false)];
    expect(unitsToStart(us, "waves", 3, { pilotOnly: true })).toEqual(["b"]);
    expect(unitsToStart(us, "waves", 3)).toEqual(["b", "c"]);
    expect(unitsToStart(us, "single", 3, { pilotOnly: true })).toEqual(["b"]);
    expect(unitsToStart([s("a", 0, "passed", "t", true), s("c", 1, "pending", null, false)], "single", 3, { pilotOnly: true })).toEqual([]);
  });
});

// D-546 (М2 Х5): migration sites. The server finds the places deterministically (with surplus); every found file is
// in exactly one unit or has a category (done, irrelevant, human).
describe("migration sites (D-546)", () => {
  const units = [{ ...u("u1", ["AC-1"]), files: ["src/a.ts", "src/b.ts"] }, { ...u("u2", ["AC-2", "AC-3"]), files: ["src/c.ts"] }];
  it("every found file in one unit or skipped with a category; a file twice or not at all is a problem", () => {
    expect(validateSites(["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts"], units, [{ file: "src/d.ts", why: "irrelevant" }])).toEqual([]);
    expect(validateSites(["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"], units, [])).toEqual([
      { kind: "uncovered_site", id: "src/d.ts" },
      { kind: "uncovered_site", id: "src/e.ts" },
    ]);
    expect(validateSites(["src/a.ts"], [...units, { ...u("u3", []), files: ["src/a.ts"] }], [{ file: "src/a.ts", why: "done" }])).toEqual([
      { kind: "site_twice", id: "src/a.ts" },
    ]);
  });
  it("the table of sites: each file with its category and unit; files a unit names that were not found are new", () => {
    expect(siteTable(["src/a.ts", "src/d.ts"], [{ ...u("u1", ["AC-1"]), files: ["src/a.ts", "src/new.ts"] }], [{ file: "src/d.ts", why: "human" }])).toEqual([
      { file: "src/a.ts", category: "unit", unit: "u1" },
      { file: "src/d.ts", category: "human" },
      { file: "src/new.ts", category: "new", unit: "u1" },
    ]);
  });
});

describe("sites for a person in the seal (D-546)", () => {
  it("each site a person must migrate is listed as not checked", () => {
    const s = sealFor({ spec, specHash: `sha256:${"a".repeat(64)}`, oracleHash: `sha256:${"b".repeat(64)}`, verdict: "VERIFIED", head: "c".repeat(40), evidence: [], ledgerHead: null, sites: [{ file: "src/a.ts", category: "unit" }, { file: "src/money.ts", category: "human" }] });
    expect(s.unchecked).toContain("src/money.ts: a migration site for a person");
    expect(s.unchecked.join(" ")).not.toContain("src/a.ts");
  });
});

describe("a seal for a person when only mutants or timing are open (D-598, Симо 24.11)", () => {
  it("VERIFIED seals; UNKNOWN seals only when every reason is a surviving mutant, a weak oracle grade or slower tests", () => {
    expect(sealable("VERIFIED", [])).toBe(true);
    expect(sealable("UNKNOWN", ["D11:survived:src/giftcards/cards.ts:3", "D11:oracle_too_weak:1/3", "D14:slower:t"])).toBe(true);
    expect(sealable("UNKNOWN", ["D11:survived:src/a.ts:3", "D12:console_error:/"])).toBe(false);
    expect(sealable("UNKNOWN", [])).toBe(false);
    expect(sealable("FAILED", ["D11:survived:src/a.ts:3"])).toBe(false);
  });
  it("the seal names each surviving mutant and the oracle's grade, not 'not run'", () => {
    const ev = [
      { detector: "D11.mutation", status: "unknown" as const, data: { sites: 3, killed: 1, survived: [{ path: "src/giftcards/cards.ts", line: 3, from: "0", to: "1" }, { path: "src/giftcards/cards.ts", line: 22, from: "||", to: "&&" }] } },
      { detector: "D11.oracle", status: "unknown" as const, data: { total: 3, killed: 1, score: 0.333, threshold: 0.6 } },
    ];
    expect(uncheckedOf(spec, ev)).toEqual([
      "AC-3: proof by a person",
      "D11.mutation: a mutant survived at src/giftcards/cards.ts:3 (0 → 1); a person decides",
      "D11.mutation: a mutant survived at src/giftcards/cards.ts:22 (|| → &&); a person decides",
      "D11.oracle: the hidden tests caught 1/3 mutants; a person decides",
    ]);
  });
});

describe("what a unit may leave to the final check (live test 20.11)", () => {
  it("VERIFIED lands; UNKNOWN only for surviving mutants or slower tests lands; anything else does not", () => {
    expect(unitLands("VERIFIED", [])).toBe(true);
    expect(unitLands("UNKNOWN", ["D11:survived:src/a.ts:3", "D14:slower:t"])).toBe(true);
    expect(unitLands("UNKNOWN", ["D11:survived:src/a.ts:3", "D3:protected_path:src/payments/**"])).toBe(false);
    expect(unitLands("UNKNOWN", [])).toBe(false);
    expect(unitLands("FAILED", ["D11:survived:src/a.ts:3"])).toBe(false);
  });
});

// D-711 (night 27.11.2026): a blind retry knew only "AC-1 still fails" and passed 1 time in 16; the failing hidden
// test's own title says what is missing. Only titles of the unit's own criteria, only the sentence (never the path, the
// describe chain or the body), and never one that carries a number or a quote (a literal invites hardcoding).
describe("the titles of the failed hidden tests for a retry (D-711)", () => {
  const ev = (failed: string[]) => [{ detector: "D5.hidden", status: "fail" as const, data: { failed } }];
  it("the sentence after the tag, in scope only, without numbers or quotes, each once", () => {
    const f = ev([
      "tests/__hidden__/loyalty.spec.ts > loyalty points > AC-1: points count the whole total, including the gift card part",
      "tests/__hidden__/loyalty.spec.ts > loyalty points > AC-1: points count the whole total, including the gift card part",
      "tests/__hidden__/x.spec.ts > AC-2: 1250 cents give 12 points",
      "tests/__hidden__/x.spec.ts > AC-3: rejects an \"EXPIRED\" card",
      "tests/__hidden__/x.spec.ts > AC-9: refunds the card once",
      "tests/__hidden__/x.spec.ts > U-1: keeps the cart rules",
    ]);
    expect(failingTitles(f, ["AC-1", "AC-2", "AC-3", "U-1"])).toEqual(["AC-1: points count the whole total, including the gift card part"]);
    expect(failingTitles(f, ["AC-9"])).toEqual(["AC-9: refunds the card once"]);
    expect(failingTitles([{ detector: "D5.hidden", status: "pass" as const, data: { failed: [] } }], ["AC-1"])).toEqual([]);
  });
  it("a long title is cut, and at most six", () => {
    const many = ev(Array.from({ length: 9 }, (_, i) => `t.spec.ts > AC-1: case ${"abcdefghi"[i]} ${"x".repeat(200)}`));
    const out = failingTitles(many, ["AC-1"]);
    expect(out).toHaveLength(6);
    for (const x of out) expect(x.length).toBeLessThanOrEqual(160);
  });
});
