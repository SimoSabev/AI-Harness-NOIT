import { describe, expect, it } from "vitest";
import type { PlanUnit } from "@mandat/contract";
import { criterionModules, scopedApi, sharedModuleProblems } from "./plan-modules.js";

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
