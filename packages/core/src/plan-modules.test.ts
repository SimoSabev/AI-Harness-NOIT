import { describe, expect, it } from "vitest";
import type { PlanUnit } from "@mandat/contract";
import { OWN_API_MARK, criterionModules, laterHome, markOwnApi, orderSharedModules, scopedApi, sharedModuleProblems } from "./plan-modules.js";

// D-594 / D-595 (live test 24.11.2026, runs 5 and 6 of M4 on the bakery): one hidden test of AC-11 checked both new stores
// (points and gift cards) while the plan gave them to two units that ran side by side, so neither could pass; and a unit's
// writer got the API of the whole oracle and built every unit's work at once.
const file = (path: string, data: string) => ({ path, data: Buffer.from(data) });
const HIDDEN = file(
  "tests/__hidden__/loyalty-giftcards.spec.ts",
  `import { payOrder } from "../../src/payments/payment";
describe("loyalty", () => {
  it("AC-1: paid order awards points", async () => {
    const { createPointsStore, awardPoints } = await import("../../src/loyalty/points");
    awardPoints(createPointsStore(), "c1", await payOrder());
  });
  it("AC-3: 100 points give 500 cents off", async () => {
    const { createPointsStore } = await import("../../src/loyalty/points");
    const { redeemPoints } = await import("../../src/loyalty/redeem.js");
    redeemPoints(createPointsStore());
  });
});
describe("giftcards", () => {
  it("AC-6: a card has a unique code", async () => {
    const { createGiftCardStore, createGiftCard } = await import("../../src/giftcards/store");
    createGiftCard(createGiftCardStore(), 100);
  });
  it("AC-11: stores are in-memory Maps with reset", async () => {
    const { createPointsStore } = await import("../../src/loyalty/points");
    const { createGiftCardStore } = await import("../../src/giftcards/store");
    createPointsStore(); createGiftCardStore();
  });
});
describe("unchanged", () => {
  it("U-1: payOrder still charges the total", async () => { await payOrder(); });
});
`,
);
const unit = (id: string, criteria: string[], depends_on: string[] = []): PlanUnit => ({ id, title: id, criteria, depends_on });

describe("the new modules each criterion's tests import (D-594)", () => {
  it("only modules imported inside a test with await import, from the repo root, without the extension; top imports are existing code", () => {
    const m = criterionModules([HIDDEN]);
    expect(m.get("AC-1")).toEqual(["src/loyalty/points"]);
    expect(m.get("AC-3")).toEqual(["src/loyalty/points", "src/loyalty/redeem"]);
    expect(m.get("AC-6")).toEqual(["src/giftcards/store"]);
    expect(m.get("AC-11")).toEqual(["src/giftcards/store", "src/loyalty/points"]);
    expect(m.has("U-1")).toBe(false);
  });
});

describe("a module imported through a helper of the file (live test 24.11, oracle v3)", () => {
  it("const x = () => import(...), an async arrow and a function returning import(...) count where the test calls them", () => {
    const cards = file(
      "tests/__hidden__/giftcards.spec.ts",
      `const cards = () => import("../../src/giftcards/cards");
const checkout = async () => import("../../src/giftcards/checkout");
function store() { return import("../../src/giftcards/store"); }
describe("giftcards", () => {
  it("AC-6: a new card", async () => { const { createCard } = await cards(); createCard(); });
  it("AC-7: pay", async () => { const c = await checkout(); const s = await store(); c.pay(s); });
  it("AC-11: the gift card store resets", async () => { const { cardStore } = await cards(); cardStore(); });
});
`,
    );
    const loy = file("tests/__hidden__/loyalty.spec.ts", `const loy = () => import("../../src/loyalty/points");\nit("AC-11: the loyalty store resets", async () => { (await loy()).reset(); });\n`);
    const m = criterionModules([cards, loy]);
    expect(m.get("AC-6")).toEqual(["src/giftcards/cards"]);
    expect(m.get("AC-7")).toEqual(["src/giftcards/checkout", "src/giftcards/store"]);
    expect(m.get("AC-11")).toEqual(["src/giftcards/cards", "src/loyalty/points"]);
  });
});

describe("units side by side never share a new module (D-594)", () => {
  const m = criterionModules([HIDDEN]);
  it("run 6: AC-11 in u1 and u3, which run in parallel, both need src/giftcards/store and src/loyalty/points → a problem", () => {
    const p = sharedModuleProblems([unit("u1", ["AC-1", "AC-11"]), unit("u2", ["AC-3"], ["u1"]), unit("u3", ["AC-6", "AC-11"])], m);
    expect(p.length).toBeGreaterThan(0);
    expect(p.every((x) => x.kind === "shared_new_module")).toBe(true);
    expect(p.map((x) => x.id)).toContain("u1+u3:src/giftcards/store");
  });
  it("run 5: AC-11 alone in u1 next to u4 (AC-6) is a problem too", () => {
    expect(sharedModuleProblems([unit("u1", ["AC-11"]), unit("u4", ["AC-6"])], m).map((x) => x.id)).toEqual(["u1+u4:src/giftcards/store"]);
  });
  it("a unit after both (AC-11 depends on the points and gift card units) is fine; so is one after the other", () => {
    expect(sharedModuleProblems([unit("u1", ["AC-1"]), unit("u2", ["AC-6"]), unit("u3", ["AC-11"], ["u1", "u2"]), unit("u4", ["AC-3"], ["u1"])], m)).toEqual([]);
    expect(sharedModuleProblems([unit("u1", ["AC-1"]), unit("u2", ["AC-3"], ["u1"])], m)).toEqual([]);
  });
  it("ancestry is transitive; a module that exists on the base is not new", () => {
    expect(sharedModuleProblems([unit("u1", ["AC-1"]), unit("u2", ["AC-6"], ["u1"]), unit("u3", ["AC-11"], ["u2"])], m)).toEqual([]);
    expect(sharedModuleProblems([unit("u1", ["AC-11"]), unit("u4", ["AC-6"])], m, (p) => p === "src/giftcards/store")).toEqual([]);
  });
});

describe("a unit's API is its scope's (D-595)", () => {
  const api = [
    "`src/loyalty/points.ts`: `createPointsStore(): Store` — the store.",
    "`src/loyalty/points.ts`: `awardPoints(store, id, order): number` — adds points.",
    "`src/loyalty/redeem.ts`: `redeemPoints(store, id, order): Order` — 500 cents off.",
    "`src/giftcards/store.ts`: `createGiftCardStore(): Store` — the cards.",
    "`src/giftcards/store.ts`: `createGiftCard(store, cents): Card` — a new card.",
    "`src/giftcards/checkout.ts`: `payWithGiftCard(...)` — pays.",
  ];
  it("only the names its scope's tests call; a name no test calls stays (it cannot be placed)", () => {
    expect(scopedApi(api, [HIDDEN], ["AC-1"])).toEqual([api[0], api[1], api[5]]);
    expect(scopedApi(api, [HIDDEN], ["AC-6"])).toEqual([api[3], api[4], api[5]]);
    expect(scopedApi(api, [HIDDEN], ["AC-1", "AC-3"])).toEqual([api[0], api[1], api[2], api[5]]);
  });
  it("no hidden files or no scope: the whole API, as before", () => {
    expect(scopedApi(api, [], ["AC-1"])).toEqual(api);
    expect(scopedApi(api, [HIDDEN], [])).toEqual(api);
  });
});

// D-616 (live test 26.11, run 9): AC-11's hidden test of the gift card store calls issueGiftCard, which AC-6 (a later
// unit) also names; u1's writer read "do only this unit", left issueGiftCard to u5 and failed AC-11 three times
describe("the API names a unit's own checks call are marked to build now (D-616)", () => {
  const RUN9 = file(
    "tests/__hidden__/loyalty-giftcards.spec.ts",
    `describe("gift cards", () => {
  it("AC-6: a new card has a unique code", async () => {
    const { createGiftCardStore, issueGiftCard } = await import("../../src/giftcards/cards");
    issueGiftCard(createGiftCardStore(), 100);
  });
  it("AC-11: the gift card store is an in-memory Map with reset()", async () => {
    const { createGiftCardStore, issueGiftCard } = await import("../../src/giftcards/cards");
    const s = createGiftCardStore(); issueGiftCard(s, 100); s.reset();
  });
});
`,
  );
  const api = [
    "`src/giftcards/cards.ts`: `createGiftCardStore(): GiftCardStore` — the cards.",
    "`src/giftcards/cards.ts`: `issueGiftCard(store, initialCents: number): GiftCard` — a new card.",
    "`src/giftcards/checkout.ts`: `payWithGiftCard(...)` — pays.",
  ];
  it("a line whose name the unit's own criteria's checks call gets the mark; the others stay as they were", () => {
    const out = markOwnApi(api, [RUN9], ["AC-11"]);
    expect(out[0]).toBe(`${OWN_API_MARK}${api[0]}`);
    expect(out[1]).toBe(`${OWN_API_MARK}${api[1]}`);
    expect(out[2]).toBe(api[2]);
  });
  it("checks of landed or unchanged criteria do not mark; no files or no criteria: unchanged", () => {
    expect(markOwnApi(api, [RUN9], ["AC-7"])).toEqual(api);
    expect(markOwnApi(api, [], ["AC-11"])).toEqual(api);
    expect(markOwnApi(api, [RUN9], [])).toEqual(api);
  });
});

describe("a plan whose only problem is a shared new module is ordered, not refused (D-603, live test 25.11, run 8)", () => {
  // oracle v4: AC-1's test counts the gift card part, so points and gift cards meet in more criteria than the planner untangled
  const mods = new Map<string, string[]>([
    ["AC-1", ["src/giftcards/cards", "src/giftcards/checkout", "src/loyalty/points"]],
    ["AC-2", ["src/loyalty/points"]],
    ["AC-3", ["src/loyalty/checkout", "src/loyalty/points"]],
    ["AC-6", ["src/giftcards/cards"]],
    ["AC-7", ["src/giftcards/cards", "src/giftcards/checkout"]],
    ["AC-11", ["src/giftcards/cards", "src/loyalty/points"]],
  ]);
  const plan = [unit("u1", ["AC-1", "AC-2"]), unit("u2", ["AC-3"], ["u1"]), unit("u3", ["AC-6", "AC-11"]), unit("u4", ["AC-7"])];
  it("each later unit of a clashing pair waits for the earlier one; then nothing is shared and the planner's units stay", () => {
    expect(sharedModuleProblems(plan, mods).length).toBeGreaterThan(0);
    const ordered = orderSharedModules(plan, mods);
    expect(sharedModuleProblems(ordered, mods)).toEqual([]);
    expect(ordered.map((u) => [u.id, u.criteria])).toEqual(plan.map((u) => [u.id, u.criteria]));
    expect(ordered.find((u) => u.id === "u3")?.depends_on).toContain("u1");
    expect(ordered.find((u) => u.id === "u4")?.depends_on).toEqual(expect.arrayContaining(["u1"]));
    // only earlier units are waited for, so the plan stays acyclic and valid
    ordered.forEach((u, n) => u.depends_on.forEach((d) => expect(ordered.findIndex((x) => x.id === d)).toBeLessThan(n)));
  });
  it("a plan without shared modules comes back unchanged", () => {
    const fine = [unit("u1", ["AC-2"]), unit("u2", ["AC-6"])];
    expect(orderSharedModules(fine, mods)).toEqual(fine);
  });
});

// D-623 (live test 26.11, run 10): AC-1's hidden test counts the gift card part, so it imports src/giftcards/checkout —
// the module u6 (which waits for u3) builds for AC-7..AC-10. u3 held AC-1 and failed it in 3 attempts and 2 rescue tries.
describe("a failing criterion that needs a module a later unit builds goes to that unit (D-623)", () => {
  const mods = new Map<string, string[]>([
    ["AC-1", ["src/giftcards/cards", "src/giftcards/checkout", "src/loyalty/points"]],
    ["AC-2", ["src/loyalty/points"]],
    ["AC-6", ["src/giftcards/cards"]],
    ["AC-7", ["src/giftcards/cards", "src/giftcards/checkout"]],
    ["AC-9", ["src/giftcards/cards", "src/giftcards/checkout"]],
    ["AC-11", ["src/giftcards/cards", "src/loyalty/points"]],
  ]);
  const run10 = [
    unit("u1", ["AC-11"]),
    unit("u2", ["AC-6", "AC-11"], ["u1"]),
    unit("u3", ["AC-1", "AC-2"], ["u1"]),
    unit("u6", ["AC-7"], ["u2", "u3"]),
    unit("u7", ["AC-9"], ["u6"]),
  ];
  const open = (id: string) => id === "u6" || id === "u7";
  it("AC-1 of u3 goes to u6, the first later unit not started yet that needs checkout (cards and points are landed)", () => {
    expect(laterHome(run10, mods, { unit: "u3", failing: ["AC-1"], landed: ["u1", "u2"], open })).toEqual(new Map([["AC-1", "u6"]]));
  });
  it("nothing moves when a failing criterion needs no later module, the unit's other criteria need it, or no later unit is open", () => {
    expect(laterHome(run10, mods, { unit: "u3", failing: ["AC-1", "AC-2"], landed: ["u1", "u2"], open })).toEqual(new Map());
    expect(laterHome(run10, mods, { unit: "u3", failing: ["AC-1"], landed: ["u1", "u2"], open, exists: (m) => m === "src/giftcards/checkout" })).toEqual(new Map());
    const both = run10.map((u) => (u.id === "u3" ? { ...u, criteria: ["AC-1", "AC-9"] } : u));
    expect(laterHome(both, mods, { unit: "u3", failing: ["AC-1"], landed: ["u1", "u2"], open })).toEqual(new Map());
    expect(laterHome(run10, mods, { unit: "u3", failing: ["AC-1"], landed: ["u1", "u2"], open: () => false })).toEqual(new Map());
  });
  it("no failing criteria or an unknown unit: nothing moves", () => {
    expect(laterHome(run10, mods, { unit: "u3", failing: [], landed: ["u1", "u2"], open })).toEqual(new Map());
    expect(laterHome(run10, mods, { unit: "u9", failing: ["AC-1"], landed: ["u1", "u2"], open })).toEqual(new Map());
  });
});
