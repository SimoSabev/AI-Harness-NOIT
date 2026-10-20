import { describe, expect, it } from "vitest";
import { discountCents, subtotalCents, totalCents } from "../src/cart";

describe("cart", () => {
  it("empty cart has zero subtotal", () => {
    expect(subtotalCents([])).toBe(0);
  });
  it("subtotal sums price times qty", () => {
    expect(subtotalCents([{ sku: "a", priceCents: 250, qty: 2 }, { sku: "b", priceCents: 100, qty: 3 }])).toBe(800);
  });
  it("ignores items with qty 0", () => {
    expect(subtotalCents([{ sku: "a", priceCents: 999, qty: 0 }, { sku: "b", priceCents: 100, qty: 1 }])).toBe(100);
  });
  it("rejects negative qty", () => {
    expect(() => subtotalCents([{ sku: "a", priceCents: 100, qty: -1 }])).toThrow(RangeError);
  });
  it("rejects negative price", () => {
    expect(() => subtotalCents([{ sku: "a", priceCents: -100, qty: 1 }])).toThrow(RangeError);
  });
  it("no discount under 50", () => {
    expect(discountCents(4999)).toBe(0);
  });
  it("no discount at exactly 50", () => {
    expect(discountCents(5000)).toBe(0);
  });
  it("applies 10% over 50", () => {
    expect(discountCents(10000)).toBe(1000);
  });
  it("rounds discount down to whole cents", () => {
    expect(discountCents(60005)).toBe(6000);
  });
  it("total is subtotal minus discount", () => {
    expect(totalCents([{ sku: "a", priceCents: 1000, qty: 3 }])).toBe(3000);
  });
  it("large cart total", () => {
    expect(totalCents([{ sku: "a", priceCents: 35000, qty: 2 }])).toBe(63000);
  });
  it("discount is never negative", () => {
    expect(discountCents(0)).toBeGreaterThanOrEqual(0);
  });
});
