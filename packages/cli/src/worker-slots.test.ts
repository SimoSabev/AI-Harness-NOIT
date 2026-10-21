import { describe, expect, it } from "vitest";
import { slotsFrom, workerSlots } from "./commands/worker.js";

describe("worker slots (D-299)", () => {
  it("MANDAT_WORKER_SLOTS: 1–8, иначе по подразбиране", () => {
    expect(slotsFrom(undefined, 2)).toBe(2);
    expect(slotsFrom("4", 1)).toBe(4);
    expect(slotsFrom("0", 2)).toBe(2);
    expect(slotsFrom("99", 2)).toBe(8);
    expect(slotsFrom("abc", 3)).toBe(3);
  });

  it("N слота вземат задачи едновременно; ефектите имат свой цикъл", async () => {
    let running = 0;
    let peak = 0;
    const queue = ["t1", "t2", "t3", "t4"];
    let drains = 0;
    const ac = new AbortController();
    await workerSlots({
      slots: 3,
      once: false,
      signal: ac.signal,
      pollMs: 1,
      tick: async () => {
        const id = queue.shift() ?? null;
        if (!id) {
          ac.abort();
          return null;
        }
        running++;
        peak = Math.max(peak, running);
        await new Promise((r) => setTimeout(r, 20));
        running--;
        return id;
      },
      drain: async () => void drains++,
    });
    expect(peak).toBe(3);
    expect(queue).toEqual([]);
    expect(drains).toBeGreaterThan(0);
  });

  it("--once: по една задача на слот, после край", async () => {
    let n = 0;
    await workerSlots({ slots: 2, once: true, pollMs: 1, tick: async () => `t${++n}`, drain: async () => undefined });
    expect(n).toBe(2);
  });
});
