import { percentOf } from "../shared/money.js";
import type { Cents } from "../shared/money.js";

/** 10% off an order over 50 € (strictly over: exactly 50 € gets nothing) */
export const DISCOUNT_THRESHOLD_CENTS: Cents = 5000;
export const DISCOUNT_PERCENT = 10;

export function discountCents(subtotal: Cents): Cents {
  return subtotal > DISCOUNT_THRESHOLD_CENTS ? percentOf(subtotal, DISCOUNT_PERCENT) : 0;
}
