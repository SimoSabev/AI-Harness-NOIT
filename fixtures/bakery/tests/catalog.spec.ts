import { describe, expect, it } from "vitest";
import { CATALOG, findProduct } from "../src/catalog/products";
import { search } from "../src/catalog/search";

describe("catalog", () => {
  it("finds a product by id", () => {
    expect(findProduct("p-banitsa")?.name).toBe("Banitsa with cheese");
    expect(findProduct("nope")).toBeUndefined();
  });
  it("every product has a positive price in cents", () => {
    for (const p of CATALOG) expect(Number.isInteger(p.priceCents) && p.priceCents > 0).toBe(true);
  });
});

describe("search", () => {
  it("matches the name, case-insensitive, in catalog order", () => {
    expect(search("BREAD").map((p) => p.id)).toEqual(["p-rye"]);
    expect(search("").length).toBe(CATALOG.length);
  });
  it("filters by category, allergens and what can be ordered today", () => {
    expect(search("", { category: "cake" }).map((p) => p.id)).toEqual(["p-garash", "p-honey"]);
    expect(search("", { category: "cake", availableOnly: true }).map((p) => p.id)).toEqual(["p-garash"]);
    expect(search("", { without: ["gluten"] }).map((p) => p.id)).toEqual(["p-garash"]);
  });
});
