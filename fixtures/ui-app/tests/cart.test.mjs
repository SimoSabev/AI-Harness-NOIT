import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { discountCents, subtotalCents, totalCents } from "../src/cart.mjs";

describe("cart", () => {
  it("empty cart has zero subtotal", () => {
    assert.equal(subtotalCents([]), 0);
  });
  it("subtotal sums price times qty", () => {
    assert.equal(subtotalCents([{ sku: "a", priceCents: 250, qty: 2 }, { sku: "b", priceCents: 100, qty: 3 }]), 800);
  });
  it("ignores items with qty 0", () => {
    assert.equal(subtotalCents([{ sku: "a", priceCents: 999, qty: 0 }, { sku: "b", priceCents: 100, qty: 1 }]), 100);
  });
  it("rejects negative qty", () => {
    assert.throws(() => subtotalCents([{ sku: "a", priceCents: 100, qty: -1 }]), RangeError);
  });
  it("rejects negative price", () => {
    assert.throws(() => subtotalCents([{ sku: "a", priceCents: -100, qty: 1 }]), RangeError);
  });
  it("no discount under 50", () => {
    assert.equal(discountCents(4999), 0);
  });
  it("no discount at exactly 50", () => {
    assert.equal(discountCents(5000), 0);
  });
  it("applies 10% over 50", () => {
    assert.equal(discountCents(10000), 1000);
  });
  it("rounds discount down to whole cents", () => {
    assert.equal(discountCents(60005), 6000);
  });
  it("total is subtotal minus discount", () => {
    assert.equal(totalCents([{ sku: "a", priceCents: 1000, qty: 3 }]), 3000);
  });
  it("large cart total", () => {
    assert.equal(totalCents([{ sku: "a", priceCents: 35000, qty: 2 }]), 63000);
  });
  it("discount is never negative", () => {
    assert.ok(discountCents(0) >= 0);
  });
});
