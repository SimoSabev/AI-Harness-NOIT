import type { Cents } from "../shared/money.js";

export type Category = "bread" | "pastry" | "cake" | "drink";
export type Allergen = "gluten" | "milk" | "eggs" | "nuts" | "sesame";

export interface Product {
  id: string;
  name: string;
  category: Category;
  priceCents: Cents;
  allergens: readonly Allergen[];
  available: boolean;
}

export const CATALOG: readonly Product[] = [
  { id: "p-sourdough", name: "Sourdough loaf", category: "bread", priceCents: 450, allergens: ["gluten"], available: true },
  { id: "p-rye", name: "Rye bread", category: "bread", priceCents: 390, allergens: ["gluten"], available: true },
  { id: "p-banitsa", name: "Banitsa with cheese", category: "pastry", priceCents: 320, allergens: ["gluten", "milk", "eggs"], available: true },
  { id: "p-croissant", name: "Butter croissant", category: "pastry", priceCents: 250, allergens: ["gluten", "milk"], available: true },
  { id: "p-garash", name: "Garash cake", category: "cake", priceCents: 4200, allergens: ["eggs", "nuts", "milk"], available: true },
  { id: "p-honey", name: "Honey cake", category: "cake", priceCents: 3600, allergens: ["gluten", "eggs", "milk"], available: false },
  { id: "p-boza", name: "Boza", category: "drink", priceCents: 180, allergens: ["gluten"], available: true },
];

export function findProduct(id: string, catalog: readonly Product[] = CATALOG): Product | undefined {
  return catalog.find((p) => p.id === id);
}
