import { describe, expect, it } from "vitest";
import { formatEur, receipt } from "../src/receipt";

describe("receipt", () => {
  it("formats whole euros", () => {
    expect(formatEur(1200)).toBe("12.00 EUR");
  });
  it("pads cents", () => {
    expect(formatEur(1205)).toBe("12.05 EUR");
  });
  it("rejects negative amounts", () => {
    expect(() => formatEur(-1)).toThrow(RangeError);
  });
  it("lists items and the total under the threshold", () => {
    expect(receipt([{ sku: "a", priceCents: 250, qty: 2 }])).toEqual(["a x2", "TOTAL 5.00 EUR"]);
  });
});
