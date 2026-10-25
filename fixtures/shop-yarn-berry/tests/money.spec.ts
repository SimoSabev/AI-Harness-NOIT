import { describe, expect, it } from "vitest";
import { addCents, formatCents, mulCents, parseEuros } from "../src/money";

describe("money", () => {
  it("formats cents as euros", () => {
    expect(formatCents(1234)).toBe("12.34 EUR");
  });
  it("formats zero", () => {
    expect(formatCents(0)).toBe("0.00 EUR");
  });
  it("formats negative", () => {
    expect(formatCents(-1234)).toBe("-12.34 EUR");
  });
  it("parses euros string", () => {
    expect(parseEuros("12.34")).toBe(1234);
  });
  it("parses integer euros", () => {
    expect(parseEuros("12")).toBe(1200);
  });
  it("rejects invalid string", () => {
    expect(() => parseEuros("12,34")).toThrow(RangeError);
  });
  it("adds cents", () => {
    expect(addCents(150, 275)).toBe(425);
  });
  it("multiplies cents by qty", () => {
    expect(mulCents(250, 3)).toBe(750);
  });
});
