import { describe, expect, it } from "vitest";
import { addItem, emptyCart } from "../src/cart/cart";
import { firstSlot } from "../src/orders/delivery";
import { placeOrder } from "../src/orders/order";
import { fakeGateway, payOrder } from "../src/payments/payment";

const order = () => placeOrder("o-9", addItem(emptyCart(), "p-banitsa", 3), firstSlot("2026-12-02", 10), { name: "Ivan", phone: "0888123456", address: "Plovdiv" });

describe("payments", () => {
  it("charges the order's total and marks it paid", async () => {
    const g = fakeGateway();
    const r = await payOrder(order(), "tok_ok", g);
    expect(r).toMatchObject({ reference: "ch_o-9", error: null, order: { status: "paid" } });
    expect(g.charged).toEqual([960 + 300]);
  });
  it("a declined card leaves the order waiting for payment", async () => {
    const r = await payOrder(order(), "tok_declined", fakeGateway());
    expect(r).toMatchObject({ reference: null, error: "declined", order: { status: "placed" } });
  });
  it("an order already paid is not charged again", async () => {
    const g = fakeGateway();
    const paid = (await payOrder(order(), "tok_ok", g)).order;
    await expect(payOrder(paid, "tok_ok", g)).rejects.toThrow("not waiting for payment");
    expect(g.charged).toHaveLength(1);
  });
});
