import { describe, expect, it } from "vitest";
import { MAX_QUANTITY, addItem, emptyCart, removeItem, subtotal } from "../src/cart/cart";
import { discountCents } from "../src/cart/discounts";

describe("cart", () => {
  it("adds products and raises the quantity of one already there, without changing the old cart", () => {
    const a = addItem(emptyCart(), "p-sourdough");
    const b = addItem(a, "p-sourdough", 2);
    expect(a.lines).toEqual([{ productId: "p-sourdough", quantity: 1, unitCents: 450 }]);
    expect(b.lines).toEqual([{ productId: "p-sourdough", quantity: 3, unitCents: 450 }]);
    expect(subtotal(addItem(b, "p-boza"))).toBe(3 * 450 + 180);
  });
  it("refuses unknown, unavailable and too many", () => {
    expect(() => addItem(emptyCart(), "p-nope")).toThrow("unknown product");
    expect(() => addItem(emptyCart(), "p-honey")).toThrow("not available");
    expect(() => addItem(emptyCart(), "p-rye", MAX_QUANTITY + 1)).toThrow();
    expect(() => addItem(emptyCart(), "p-rye", 0)).toThrow();
  });
  it("removes a product", () => {
    expect(removeItem(addItem(emptyCart(), "p-rye"), "p-rye").lines).toEqual([]);
  });
});

describe("discounts", () => {
  it("10% over 50 €", () => {
    expect(discountCents(10000)).toBe(1000);
    expect(discountCents(5001)).toBe(500);
  });
  it("no discount at exactly 50 € or under", () => {
    expect(discountCents(5000)).toBe(0);
    expect(discountCents(1200)).toBe(0);
  });
});
