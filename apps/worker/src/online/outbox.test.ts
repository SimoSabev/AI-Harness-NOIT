import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, MemoryOutbox, drainOutbox } from "./outbox.js";

describe("outbox (T3-2)", () => {
  it("двоен drain → един ефект; уникален ключ", async () => {
    const s = new MemoryOutbox();
    expect(s.insert({ org_id: "o", kind: "check_run", idempotency_key: "k1" })).toBe(true);
    expect(s.insert({ org_id: "o", kind: "check_run", idempotency_key: "k1" })).toBe(false);
    const effects: string[] = [];
    const h = { check_run: (r: { idempotency_key: string }) => Promise.resolve(void effects.push(r.idempotency_key)) };
    expect(await drainOutbox(s, h)).toEqual({ done: 1, failed: 0, skipped: 0 });
    expect(await drainOutbox(s, h)).toEqual({ done: 0, failed: 0, skipped: 0 });
    expect(effects).toEqual(["k1"]);
  });
  it("грешка в ефекта → attempts+1, pending; повторен drain → done", async () => {
    const s = new MemoryOutbox();
    s.insert({ org_id: "o", kind: "web_push", idempotency_key: "p1" });
    let fail = true;
    const h = { web_push: () => (fail ? Promise.reject(new Error("503")) : Promise.resolve()) };
    expect(await drainOutbox(s, h)).toEqual({ done: 0, failed: 1, skipped: 0 });
    expect(s.rows[0]).toMatchObject({ attempts: 1, status: "pending", last_error: "503" });
    fail = false;
    expect(await drainOutbox(s, h)).toEqual({ done: 1, failed: 0, skipped: 0 });
    expect(s.rows[0]?.status).toBe("done");
  });
  it("след MAX_ATTEMPTS → failed; без handler → skipped (остава pending)", async () => {
    const s = new MemoryOutbox();
    s.insert({ org_id: "o", kind: "merge", idempotency_key: "m1" });
    s.insert({ org_id: "o", kind: "draft_pr", idempotency_key: "d1" });
    const h = { merge: () => Promise.reject(new Error("x")) };
    for (let k = 0; k < MAX_ATTEMPTS; k++) await drainOutbox(s, h);
    expect(s.rows[0]).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS });
    expect(s.rows[1]?.status).toBe("pending");
  });
});
