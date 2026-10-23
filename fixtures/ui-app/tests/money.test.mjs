import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addCents, formatCents, mulCents, parseEuros } from "../src/money.mjs";

describe("money", () => {
  it("formats cents as euros", () => {
    assert.equal(formatCents(1234), "12.34 EUR");
  });
  it("formats zero", () => {
    assert.equal(formatCents(0), "0.00 EUR");
  });
  it("formats negative", () => {
    assert.equal(formatCents(-1234), "-12.34 EUR");
  });
  it("parses euros string", () => {
    assert.equal(parseEuros("12.34"), 1234);
  });
  it("parses integer euros", () => {
    assert.equal(parseEuros("12"), 1200);
  });
  it("rejects invalid string", () => {
    assert.throws(() => parseEuros("12,34"), RangeError);
  });
  it("adds cents", () => {
    assert.equal(addCents(150, 275), 425);
  });
  it("multiplies cents by qty", () => {
    assert.equal(mulCents(250, 3), 750);
  });
});
