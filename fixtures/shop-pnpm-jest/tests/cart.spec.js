const { discountCents } = require("../src/cart");

describe("cart", () => {
  it("no discount under 50", () => {
    expect(discountCents(4999)).toBe(0);
  });
  it("no discount at exactly 50", () => {
    expect(discountCents(5000)).toBe(0);
  });
  it("applies 10% over 50", () => {
    expect(discountCents(10000)).toBe(1000);
  });
});
