import { subtotal } from "../cart/cart.js";
import type { Cart } from "../cart/cart.js";
import { discountCents } from "../cart/discounts.js";
import type { Cents } from "../shared/money.js";
import type { DeliverySlot } from "./delivery.js";

export const DELIVERY_FEE_CENTS: Cents = 300;
/** delivery is free from this subtotal on */
export const FREE_DELIVERY_FROM_CENTS: Cents = 3000;

export interface Customer { name: string; phone: string; address: string }
export type OrderStatus = "placed" | "paid" | "baking" | "out_for_delivery" | "delivered" | "cancelled";

export interface Order {
  id: string;
  customer: Customer;
  cart: Cart;
  slot: DeliverySlot;
  subtotalCents: Cents;
  discountCents: Cents;
  deliveryCents: Cents;
  totalCents: Cents;
  status: OrderStatus;
}

export function deliveryFee(sub: Cents): Cents {
  return sub >= FREE_DELIVERY_FROM_CENTS ? 0 : DELIVERY_FEE_CENTS;
}

export function placeOrder(id: string, cart: Cart, slot: DeliverySlot, customer: Customer): Order {
  if (cart.lines.length === 0) throw new Error("the cart is empty");
  if (customer.phone.replace(/\D/g, "").length < 9) throw new Error("a phone number is needed for the courier");
  const sub = subtotal(cart);
  const discount = discountCents(sub);
  const delivery = deliveryFee(sub);
  return { id, customer, cart, slot, subtotalCents: sub, discountCents: discount, deliveryCents: delivery, totalCents: sub - discount + delivery, status: "placed" };
}

const NEXT: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  placed: ["paid", "cancelled"],
  paid: ["baking", "cancelled"],
  baking: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
};

/** the order in its next status; a move the bakery does not allow throws */
export function advance(order: Order, to: OrderStatus): Order {
  if (!NEXT[order.status].includes(to)) throw new Error(`cannot go from ${order.status} to ${to}`);
  return { ...order, status: to };
}
