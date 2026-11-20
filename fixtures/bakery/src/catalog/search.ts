import { CATALOG } from "./products.js";
import type { Allergen, Category, Product } from "./products.js";

export interface SearchFilters {
  category?: Category;
  /** leave out products with any of these allergens */
  without?: readonly Allergen[];
  /** only what can be ordered today */
  availableOnly?: boolean;
}

/** case-insensitive search by name, then the filters; the catalog order is kept */
export function search(query: string, filters: SearchFilters = {}, catalog: readonly Product[] = CATALOG): Product[] {
  const q = query.trim().toLowerCase();
  return catalog.filter((p) => {
    if (q !== "" && !p.name.toLowerCase().includes(q)) return false;
    if (filters.category && p.category !== filters.category) return false;
    if (filters.without?.some((a) => p.allergens.includes(a))) return false;
    if (filters.availableOnly && !p.available) return false;
    return true;
  });
}
