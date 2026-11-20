import { search } from "../catalog/search.js";
import type { Category } from "../catalog/products.js";
import { addItem, emptyCart } from "../cart/cart.js";
import { nextSlots } from "../orders/delivery.js";
import { placeOrder } from "../orders/order.js";
import type { Customer } from "../orders/order.js";
import { isDay } from "../shared/dates.js";

// The shop's HTTP surface as plain functions (a server only parses the request and serializes the reply), so every
// route is tested without a network.

export interface Reply { status: number; body: unknown }

const CATEGORIES: readonly Category[] = ["bread", "pastry", "cake", "drink"];

export function getProducts(query: { q?: string; category?: string; available?: string }): Reply {
  const category = CATEGORIES.find((c) => c === query.category);
  if (query.category !== undefined && !category) return { status: 400, body: { error: "bad_category" } };
  return { status: 200, body: { products: search(query.q ?? "", { ...(category ? { category } : {}), availableOnly: query.available === "1" }) } };
}

export function getSlots(query: { day?: string; hour?: string }): Reply {
  const hour = Number(query.hour);
  if (!query.day || !isDay(query.day) || !Number.isInteger(hour) || hour < 0 || hour > 23) return { status: 400, body: { error: "bad_time" } };
  return { status: 200, body: { slots: nextSlots(query.day, hour, 4) } };
}

interface OrderBody { id: string; items: { productId: string; quantity: number }[]; day: string; hour: number; customer: Customer }

export function postOrder(body: OrderBody): Reply {
  try {
    let cart = emptyCart();
    for (const it of body.items) cart = addItem(cart, it.productId, it.quantity);
    const [slot] = nextSlots(body.day, body.hour, 1);
    if (!slot) return { status: 400, body: { error: "no_slot" } };
    return { status: 201, body: { order: placeOrder(body.id, cart, slot, body.customer) } };
  } catch (e) {
    return { status: 400, body: { error: e instanceof Error ? e.message : "bad_order" } };
  }
}
