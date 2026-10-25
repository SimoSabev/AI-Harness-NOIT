import { addCents, mulCents } from "@shop/money";

export interface Item {
  sku: string;
  priceCents: number;
  qty: number;
}

// 10% off (rounded down to a whole cent) when the subtotal is strictly over 50 EUR.
const DISCOUNT_THRESHOLD_CENTS = 50000;

export function subtotalCents(items: Item[]): number {
  let subtotal = 0;
  for (const item of items) {
    if (item.qty < 0 || item.priceCents < 0) throw new RangeError(`invalid item ${item.sku}`);
    subtotal = addCents(subtotal, mulCents(item.priceCents, item.qty));
  }
  return subtotal;
}

export function discountCents(subtotal: number): number {
  if (subtotal > DISCOUNT_THRESHOLD_CENTS) return Math.floor(subtotal / 10);
  return 0;
}

export function totalCents(items: Item[]): number {
  const subtotal = subtotalCents(items);
  return subtotal - discountCents(subtotal);
}
