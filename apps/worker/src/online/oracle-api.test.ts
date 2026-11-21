import { describe, expect, it } from "vitest";
import { apiGaps } from "./oracle-api.js";

// D-571 (live test 21.11): the oracle's API.md named only the constructors, while its tests called placeLoyaltyOrder,
// payLoyaltyOrder and payOrderWithGiftCard; no writer could guess them, so every arm failed the same hidden tests.
const T = (data: string) => [{ path: "tests/__hidden__/a.spec.ts", data: Buffer.from(data) }];

describe("apiGaps (D-571)", () => {
  it("names every member a test calls on a module it imports dynamically and API.md does not list", () => {
    const src = [
      'const L = () => import("../../src/loyalty/loyalty");',
      "async function f() { const m = await L(); const l = m.createLoyalty(); return m.placeLoyaltyOrder(l); }",
      "it('x', async () => { const { m } = await f(); await m.payLoyaltyOrder(); l.balance('c1'); });",
    ].join("\n");
    const api = ["`src/loyalty/loyalty.ts`: `createLoyalty(): Loyalty` — a ledger"];
    expect(apiGaps(T(src), api)).toEqual(["payLoyaltyOrder", "placeLoyaltyOrder"]);
  });

  it("reads direct awaits, destructuring and (await import(...)).name", () => {
    const src = [
      'const g = await import("../src/g");',
      'const { makeCard, cardBalance } = await import("../src/g");',
      'const n = (await import("../src/g")).payWithCard;',
      "g.createStore();",
    ].join("\n");
    expect(apiGaps(T(src), ["`src/g.ts`: `createStore()`", "`src/g.ts`: `makeCard()`"])).toEqual(["cardBalance", "payWithCard"]);
  });

  it("is empty when API.md covers every name, and ignores static imports and other objects", () => {
    const src = ['import { placeOrder } from "../src/order";', 'const G = () => import("../src/g");', "const m = await G(); m.createStore(); order.total();"].join("\n");
    expect(apiGaps(T(src), ["`src/g.ts`: `createStore(): Store`"])).toEqual([]);
  });
});
