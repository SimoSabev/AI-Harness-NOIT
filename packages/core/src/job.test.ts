import { describe, expect, it } from "vitest";
import { SessionSeal } from "@mandat/contract";
import type { PlanUnit, Spec } from "@mandat/contract";
import { failingCriteria, fileTags, oracleFilesFor, sealFor, uncheckedOf, validatePlan } from "./job.js";

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
