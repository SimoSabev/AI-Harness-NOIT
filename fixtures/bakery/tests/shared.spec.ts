import { describe, expect, it } from "vitest";
import { addDays, isDay, weekday } from "../src/shared/dates";
import { cents, formatEur, percentOf, sum } from "../src/shared/money";

describe("money", () => {
  it("keeps cents as whole numbers", () => {
    expect(cents(450)).toBe(450);
    expect(() => cents(4.5)).toThrow();
    expect(() => cents(-1)).toThrow();
  });
  it("rounds a percentage half up to the cent", () => {
    expect(percentOf(5005, 10)).toBe(501);
    expect(percentOf(5004, 10)).toBe(500);
    expect(sum([100, 250, 50])).toBe(400);
  });
  it("formats euros the Bulgarian way", () => {
    expect(formatEur(1250)).toBe("12,50 €");
    expect(formatEur(5)).toBe("0,05 €");
  });
});

describe("dates", () => {
  it("adds days across a month end and knows Sundays", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(weekday("2026-12-06")).toBe(0);
    expect(isDay("2026-12-06")).toBe(true);
    expect(isDay("06.12.2026")).toBe(false);
  });
});
