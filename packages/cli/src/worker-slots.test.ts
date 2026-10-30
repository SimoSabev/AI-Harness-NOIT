import { describe, expect, it, vi } from "vitest";
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

  // D-444: one lost connection to the database never stops `pnpm local`
  describe("загубена връзка с базата (D-444)", () => {
    const lost = () => Object.assign(new Error("Connection terminated due to connection timeout"), { cause: new Error("Connection terminated unexpectedly") });

    it("ефектите и задачите продължават; един ред при загуба и един при връщане", async () => {
      const ac = new AbortController();
      const log = vi.fn();
      let ticks = 0;
      let drains = 0;
      const stillDown = () => ticks + drains <= 4; // the outage ends once for both loops
      await workerSlots({
        slots: 1,
        once: false,
        signal: ac.signal,
        pollMs: 1,
        log,
        tick: async () => {
          ticks++;
          if (stillDown()) throw lost();
          return null;
        },
        drain: async () => {
          drains++;
          if (stillDown()) throw lost();
          if (drains >= 5) ac.abort();
        },
      });
      expect(ticks).toBeGreaterThan(1);
      expect(drains).toBeGreaterThanOrEqual(5);
      expect(log.mock.calls.flat()).toEqual(["[db] connection lost; retrying", "[db] connection back"]);
    });

    it("друга грешка не се скрива", async () => {
      const ac = new AbortController();
      await expect(workerSlots({ slots: 1, once: false, signal: ac.signal, pollMs: 1, tick: async () => { throw new Error("a bug"); }, drain: async () => ac.abort() })).rejects.toThrow("a bug");
    });

    it("--once: грешката стига до извикващия", async () => {
      await expect(workerSlots({ slots: 1, once: true, pollMs: 1, tick: async () => { throw lost(); }, drain: async () => undefined })).rejects.toThrow("Connection terminated");
    });
  });
});
