import { totalCents } from "@shop/cart";
import type { Item } from "@shop/cart";

/** "12.34 EUR" for a non-negative amount in cents. */
export function formatEur(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new RangeError(`invalid amount ${cents}`);
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")} EUR`;
}

/** One line per item, then the total. */
export function receipt(items: Item[]): string[] {
  return [...items.map((i) => `${i.sku} x${i.qty}`), `TOTAL ${formatEur(totalCents(items))}`];
}
