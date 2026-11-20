import { advance } from "../orders/order.js";
import type { Order } from "../orders/order.js";
import type { Cents } from "../shared/money.js";

/** the card processor behind one small interface; tests and the demo use the fake below */
export interface PaymentGateway {
  charge(o: { orderId: string; amountCents: Cents; cardToken: string }): Promise<{ ok: true; reference: string } | { ok: false; reason: "declined" | "unavailable" }>;
}

export interface PaymentResult { order: Order; reference: string | null; error: "declined" | "unavailable" | null }

export async function payOrder(order: Order, cardToken: string, gateway: PaymentGateway): Promise<PaymentResult> {
  if (order.status !== "placed") throw new Error(`order ${order.id} is ${order.status}, not waiting for payment`);
  const r = await gateway.charge({ orderId: order.id, amountCents: order.totalCents, cardToken });
  if (!r.ok) return { order, reference: null, error: r.reason };
  return { order: advance(order, "paid"), reference: r.reference, error: null };
}

/** a gateway that accepts every token except "tok_declined" */
export function fakeGateway(): PaymentGateway & { charged: Cents[] } {
  const charged: Cents[] = [];
  return {
    charged,
    charge: async ({ orderId, amountCents, cardToken }) => {
      if (cardToken === "tok_declined") return { ok: false, reason: "declined" };
      charged.push(amountCents);
      return { ok: true, reference: `ch_${orderId}` };
    },
  };
}
