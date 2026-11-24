import { describe, expect, it } from "vitest";
import { CHAT_TEXT_MAX } from "./conversation.js";
import { HIDDEN_SEGMENT, ORACLE_API_ITEM_MAX, ORACLE_GLOB, OracleApproveBody, OracleBuildBody, personNote, OracleProblemKind, hiddenFileOf, hiddenRootPath, isHiddenPath, oracleTag, oracleTaskText, parseOracleApi, survivedNote, withApi } from "./oracle.js";
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

describe("a long spec still reaches the oracle agent whole (live test 20.11)", () => {
  it("every criterion and every unchanged behavior keeps its id and the text fits the task; short specs stay as they were", () => {
    const long = (n: number) => `${"a detailed rule about loyalty points and gift cards ".repeat(6)}${n}`;
    const big = {
      ...spec,
      criteria: Array.from({ length: 12 }, (_, k) => ({ id: `AC-${k + 1}`, when: long(k), shall: long(k + 100), proof: "tests" as const })),
      unchanged: Array.from({ length: 9 }, (_, k) => long(k + 200)),
    };
    const t = oracleTaskText(big);
    expect(t.length).toBeLessThanOrEqual(4000);
    for (let k = 1; k <= 12; k++) expect(t).toContain(`\nAC-${k}: `);
    for (let k = 1; k <= 9; k++) expect(t).toContain(`\nU-${k}: `);
    expect(oracleTaskText(spec)).not.toContain("…");
    // D-571: a rebuild note takes room; a smaller limit still keeps every id (live test 21.11 lost U-7 and U-8)
    const small = oracleTaskText(big, 3200);
    expect(small.length).toBeLessThanOrEqual(3200);
    for (let k = 1; k <= 9; k++) expect(small).toContain(`\nU-${k}: `);
  });
});

describe("the oracle fixes the public API of the new code (D-566, live test 21.11)", () => {
  it("the task asks for exact imports and an API.md, never names guessed by glob or regex", () => {
    const t = oracleTaskText(spec);
    expect(t).toContain("API.md");
    expect(t).toMatch(/never discover names/i);
    // live test 21.11: a top-level import of a module that does not exist yet fails the whole file on the current code
    expect(t).toContain("await import(");
  });
  it("API.md lines become the manifest's api: only '- ' lines, trimmed, bounded", () => {
    const md = "# API\n- `src/giftcards/store.ts`: `createGiftCard(code: string, balanceCents: number): void` — adds a card\nnot a line\n-   `src/loyalty/store.ts`: `pointsBalance(phone: string): number`  \n" + Array.from({ length: 80 }, (_, k) => `- line ${k}`).join("\n");
    const api = parseOracleApi(md);
    expect(api[0]).toBe("`src/giftcards/store.ts`: `createGiftCard(code: string, balanceCents: number): void` — adds a card");
    expect(api[1]).toBe("`src/loyalty/store.ts`: `pointsBalance(phone: string): number`");
    expect(api).toHaveLength(60);
    expect(parseOracleApi("x".repeat(500))).toEqual([]);
  });
  it("D-571: an item keeps the lines under it (live test 21.11 lost the rules that named redemptionCents)", () => {
    const md = [
      "# API",
      "- `src/checkout/checkout.ts`: `Checkout.placeOrder(...)`: Order — like placeOrder. Rules:",
      "  - with redeem and ≥ 100 points, `order.redemptionCents` is 500",
      "    and the points drop by 100",
      "",
      "- `src/giftcards/giftcards.ts`: `createGiftCardStore()`",
      "## Fields",
      "plain text under a heading is not an item",
    ].join("\n");
    expect(parseOracleApi(md)).toEqual([
      "`src/checkout/checkout.ts`: `Checkout.placeOrder(...)`: Order — like placeOrder. Rules: - with redeem and ≥ 100 points, `order.redemptionCents` is 500 and the points drop by 100",
      "`src/giftcards/giftcards.ts`: `createGiftCardStore()`",
    ]);
    const long = parseOracleApi(`- \`a.ts\`: \`f()\` ${"rule ".repeat(400)}`);
    expect(long[0]?.length).toBe(ORACLE_API_ITEM_MAX);
  });
  it("a writer's text gets the API as a requirement; without one it is unchanged", () => {
    expect(withApi("base", ["`src/a.ts`: `f(): void`"])).toBe("base\nPublic API the hidden checks use (provide exactly these exports):\n- `src/a.ts`: `f(): void`");
    expect(withApi("base", [])).toBe("base");
  });
});
describe("withApi fits the task (D-566)", () => {
  it("a long text gives way at its end so the API always fits in 4000 chars", () => {
    const t = withApi("x".repeat(3990), ["`src/a.ts`: `f(): void`"]);
    expect(t.length).toBeLessThanOrEqual(4000);
    expect(t).toContain("- `src/a.ts`: `f(): void`");
  });
  it("D-571: an API of 2349 chars (the live test) fits whole; a longer one keeps whole items and says how many did not fit", () => {
    const item = (k: number, n: number) => `\`src/m${k}.ts\`: \`f${k}()\` ${"r".repeat(n)}`;
    const live = Array.from({ length: 9 }, (_, k) => item(k, 240));
    const t = withApi("x".repeat(3990), live);
    expect(t.length).toBeLessThanOrEqual(4000);
    for (let k = 0; k < 9; k++) expect(t).toContain(`f${k}()`);
    const big = Array.from({ length: 20 }, (_, k) => item(k, 300));
    const u = withApi("x".repeat(3990), big);
    expect(u.length).toBeLessThanOrEqual(4000);
    expect(u).toMatch(/- … \d+ more item\(s\) did not fit/);
    const kept = u.split("\n").filter((l) => l.startsWith("- `src/"));
    for (const l of kept) expect(l.endsWith("r")).toBe(true);
  });
});

describe("a rebuild after a parked job names the mutants the old oracle let through (live test 24.11)", () => {
  it("lists each surviving change and asks for exact values, also on error paths; nothing to say without one", () => {
    const n = survivedNote([{ path: "src/giftcards/checkout.ts", line: 16, from: "0", to: "1" }]);
    expect(n).toContain("src/giftcards/checkout.ts:16 0 → 1");
    expect(n).toMatch(/error paths/);
    expect(survivedNote([])).toBe("");
    const many = survivedNote(Array.from({ length: 30 }, (_, i) => ({ path: `src/${"x".repeat(200)}.ts`, line: i + 1, from: "a".repeat(100), to: "b" })));
    expect(many.length).toBeLessThanOrEqual(1200);
    expect(many).toContain(":5 ");
    expect(many).not.toContain(":6 ");
  });
});

describe("a person's note on Build oracle again (D-593, live test 24.11)", () => {
  it("the body is empty or one trimmed note of at most 1000 chars; the note goes to the agent as the person's words", () => {
    expect(OracleBuildBody.parse({})).toEqual({});
    expect(OracleBuildBody.parse({ note: "  AC-1: a second call for the same order adds nothing  " })).toEqual({ note: "AC-1: a second call for the same order adds nothing" });
    expect(OracleBuildBody.safeParse({ note: "x".repeat(1001) }).success).toBe(false);
    expect(OracleBuildBody.safeParse({ note: "ok", other: 1 }).success).toBe(false);
    expect(personNote("AC-1: a second call adds nothing")).toMatch(/person who read the last oracle[\s\S]*AC-1: a second call adds nothing/);
    expect(personNote(undefined)).toBe("");
    expect(personNote("   ")).toBe("");
  });
});
