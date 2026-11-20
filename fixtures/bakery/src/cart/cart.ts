import { findProduct } from "../catalog/products.js";
import type { Product } from "../catalog/products.js";
import { sum } from "../shared/money.js";
import type { Cents } from "../shared/money.js";

export interface CartLine {
  productId: string;
  quantity: number;
  unitCents: Cents;
}

export interface Cart {
  lines: readonly CartLine[];
}

export const MAX_QUANTITY = 50;

export const emptyCart = (): Cart => ({ lines: [] });

/** a new cart with the product added (or its quantity raised); the input cart is not changed */
export function addItem(cart: Cart, productId: string, quantity = 1, find: (id: string) => Product | undefined = findProduct): Cart {
  const product = find(productId);
  if (!product) throw new Error(`unknown product: ${productId}`);
  if (!product.available) throw new Error(`not available today: ${product.name}`);
  if (!Number.isInteger(quantity) || quantity < 1) throw new RangeError(`bad quantity: ${quantity}`);
  const existing = cart.lines.find((l) => l.productId === productId);
  const next = (existing?.quantity ?? 0) + quantity;
  if (next > MAX_QUANTITY) throw new RangeError(`at most ${MAX_QUANTITY} of one product`);
  const line: CartLine = { productId, quantity: next, unitCents: product.priceCents };
  return { lines: existing ? cart.lines.map((l) => (l.productId === productId ? line : l)) : [...cart.lines, line] };
}

export function removeItem(cart: Cart, productId: string): Cart {
  return { lines: cart.lines.filter((l) => l.productId !== productId) };
}

export function subtotal(cart: Cart): Cents {
  return sum(cart.lines.map((l) => l.unitCents * l.quantity));
}
