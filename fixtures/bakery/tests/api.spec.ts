import { describe, expect, it } from "vitest";
import { getProducts, getSlots, postOrder } from "../src/api/routes";

describe("api", () => {
  it("GET /products with a search and filters; a bad category is 400", () => {
    expect(getProducts({ q: "banitsa" })).toMatchObject({ status: 200, body: { products: [{ id: "p-banitsa" }] } });
    expect((getProducts({ category: "cake", available: "1" }).body as { products: unknown[] }).products).toHaveLength(1);
    expect(getProducts({ category: "pizza" })).toEqual({ status: 400, body: { error: "bad_category" } });
  });
  it("GET /slots needs a day and an hour", () => {
    expect((getSlots({ day: "2026-12-02", hour: "10" }).body as { slots: unknown[] }).slots).toHaveLength(4);
    expect(getSlots({ day: "tomorrow", hour: "10" }).status).toBe(400);
  });
  it("POST /orders makes an order or says why not", () => {
    const ok = postOrder({ id: "o-api", items: [{ productId: "p-rye", quantity: 2 }], day: "2026-12-02", hour: 10, customer: { name: "A", phone: "0888123456", address: "Varna" } });
    expect(ok).toMatchObject({ status: 201, body: { order: { totalCents: 780 + 300, status: "placed" } } });
    expect(postOrder({ id: "o-bad", items: [{ productId: "p-honey", quantity: 1 }], day: "2026-12-02", hour: 10, customer: { name: "A", phone: "0888123456", address: "Varna" } }).status).toBe(400);
  });
});
