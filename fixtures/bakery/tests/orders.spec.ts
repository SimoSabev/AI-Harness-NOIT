import { describe, expect, it } from "vitest";
import { addItem, emptyCart } from "../src/cart/cart";
import { firstSlot, nextSlots } from "../src/orders/delivery";
import { advance, deliveryFee, placeOrder } from "../src/orders/order";

const customer = { name: "Maria", phone: "+359 888 123 456", address: "Sofia, Vitosha 1" };

describe("delivery slots", () => {
  it("an order before 18:00 goes out the next morning; after 18:00 the day after", () => {
    expect(firstSlot("2026-12-02", 10)).toEqual({ day: "2026-12-03", slot: "morning" });
    expect(firstSlot("2026-12-02", 19)).toEqual({ day: "2026-12-04", slot: "morning" });
  });
  it("never on a Sunday", () => {
    expect(firstSlot("2026-12-05", 9).day).toBe("2026-12-07");
    expect(nextSlots("2026-12-04", 9, 3)).toEqual([{ day: "2026-12-05", slot: "morning" }, { day: "2026-12-05", slot: "afternoon" }, { day: "2026-12-07", slot: "morning" }]);
  });
});

describe("orders", () => {
  it("totals: subtotal, the discount, delivery (free from 30 €)", () => {
    const small = placeOrder("o-1", addItem(emptyCart(), "p-croissant", 2), firstSlot("2026-12-02", 10), customer);
    expect([small.subtotalCents, small.discountCents, small.deliveryCents, small.totalCents]).toEqual([500, 0, 300, 800]);
    const big = placeOrder("o-2", addItem(emptyCart(), "p-garash", 2), firstSlot("2026-12-02", 10), customer);
    expect([big.subtotalCents, big.discountCents, big.deliveryCents, big.totalCents]).toEqual([8400, 840, 0, 7560]);
    expect(deliveryFee(3000)).toBe(0);
  });
  it("needs items and a phone", () => {
    expect(() => placeOrder("o-3", emptyCart(), firstSlot("2026-12-02", 10), customer)).toThrow("empty");
    expect(() => placeOrder("o-4", addItem(emptyCart(), "p-rye"), firstSlot("2026-12-02", 10), { ...customer, phone: "12" })).toThrow("phone");
  });
  it("moves only forward through its statuses", () => {
    const o = placeOrder("o-5", addItem(emptyCart(), "p-rye"), firstSlot("2026-12-02", 10), customer);
    expect(advance(advance(o, "paid"), "baking").status).toBe("baking");
    expect(() => advance(o, "delivered")).toThrow();
  });
});
