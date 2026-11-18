import { describe, expect, it } from "vitest";
import { CHAT_TEXT_MAX } from "./conversation.js";
import { HIDDEN_SEGMENT, ORACLE_GLOB, OracleApproveBody, OracleProblemKind, hiddenFileOf, hiddenRootPath, isHiddenPath, oracleTag, oracleTaskText } from "./oracle.js";
import { Contract, DetectorId, LedgerKind } from "./schemas.js";
import type { Spec } from "./task-spec.js";

// D-534 (М1 Х3): the oracle agent's task, the test tags and the approve body.
const spec: Spec = {
  goal: "Round discounts half up",
  product: "The cart rounds a discount that ends in .5 up. ".repeat(200),
  criteria: [
    { id: "AC-1", when: "a discount ends in .5", shall: "round it up", proof: "tests" },
    { id: "AC-2", when: "a discount is negative", shall: "be 0", proof: "tests" },
  ],
  unchanged: ["whole-number totals", "the empty cart"],
  out_of_scope: ["currencies"],
  profile: "feature",
};

describe("hidden test paths (D-536)", () => {
  const ok = ["packages/x/test/__hidden__/a.spec.ts", "tests/__hidden__/a.spec.ts", "__hidden__/a.test.ts", "packages/engine/test/__hidden__/deep/vec3.spec.ts"];
  const bad = ["../tests/__hidden__/a.spec.ts", "tests/__hidden__/../../a.spec.ts", "/tests/__hidden__/a.spec.ts", "C:/r/__hidden__/a.spec.ts", "tests\\__hidden__\\a.spec.ts", "tests/a.spec.ts", "tests/__hidden__x/a.spec.ts", "tests/x__hidden__/a.spec.ts", "tests//__hidden__/a.spec.ts", "./tests/__hidden__/a.spec.ts", "", "tests/__hidden__"];
  for (const p of ok) it(`accepts ${p}`, () => expect(isHiddenPath(p)).toBe(true));
  for (const p of bad) it(`rejects ${JSON.stringify(p)}`, () => expect(isHiddenPath(p)).toBe(false));
  it("the oracle agent's scope is every __hidden__ folder; a legacy set joins its dir; a test id names its file", () => {
    expect(ORACLE_GLOB).toBe("**/__hidden__/**");
    expect(hiddenRootPath("", "packages/x/__hidden__/a.spec.ts")).toBe("packages/x/__hidden__/a.spec.ts");
    expect(hiddenRootPath("tests/__hidden__/", "a.spec.ts")).toBe("tests/__hidden__/a.spec.ts");
    expect(hiddenFileOf("packages/x/__hidden__/a.spec.ts > AC-1: y > z")).toBe("packages/x/__hidden__/a.spec.ts");
    expect(OracleProblemKind.parse("not_discovered")).toBe("not_discovered");
  });
});

describe("the oracle contract (D-534)", () => {
  it("the task text asks for tagged tests only under the oracle directory, red for criteria and green for unchanged", () => {
    const t = oracleTaskText(spec);
    // D-536: the tests go into a __hidden__ folder where the project's own runner finds them (monorepo workspaces)
    expect(t).toContain(`in a ${HIDDEN_SEGMENT} folder inside a directory the project's test runner already discovers`);
    expect(t).toMatch(/vitest\.workspace/);
    expect(t).toContain("import the code under test by relative paths");
    expect(t).toContain("Do not change any other file");
    expect(t).toContain("AC-1: WHEN a discount ends in .5 THE SYSTEM SHALL round it up (proof: tests)");
    expect(t).toContain("U-1: whole-number totals");
    expect(t).toContain("U-2: the empty cart");
    expect(t).toMatch(/must FAIL on the current code/);
    expect(t).toMatch(/must PASS on the current code/);
    // the product text is not needed and never pushes the criteria out of the 4000 chars of a contract
    expect(t).not.toContain("rounds a discount that ends");
    expect(t.length).toBeLessThanOrEqual(CHAT_TEXT_MAX);
  });
  it("a test's tag is the id at the start of its name or of a describe block", () => {
    expect(oracleTag("tests/__hidden__/a.spec.ts > AC-1: rounds .5 up")).toBe("AC-1");
    expect(oracleTag("tests/__hidden__/a.spec.ts > U-2: keeps whole totals > works")).toBe("U-2");
    expect(oracleTag("tests/__hidden__/a.spec.ts > cart > AC-12: x")).toBe("AC-12");
    expect(oracleTag("tests/__hidden__/a.spec.ts > rounds AC-1: in the middle")).toBeNull();
    expect(oracleTag("tests/__hidden__/a.spec.ts > AC-0: zero")).toBeNull();
    expect(oracleTag("tests/__hidden__/a.spec.ts > no tag")).toBeNull();
  });
  it("the approve body is only the hash; the new detector, ledger kinds and the sealed oracle_hash exist", () => {
    expect(OracleApproveBody.safeParse({ oracle_hash: `sha256:${"a".repeat(64)}` }).success).toBe(true);
    expect(OracleApproveBody.safeParse({ oracle_hash: "x" }).success).toBe(false);
    expect(OracleApproveBody.safeParse({ oracle_hash: `sha256:${"a".repeat(64)}`, tests: [] }).success).toBe(false);
    expect(DetectorId.parse("D11.oracle")).toBe("D11.oracle");
    expect(LedgerKind.parse("oracle_built")).toBe("oracle_built");
    expect(LedgerKind.parse("oracle_approved")).toBe("oracle_approved");
    expect(Contract.shape.oracle_hash.safeParse(undefined).success).toBe(true);
  });
});
