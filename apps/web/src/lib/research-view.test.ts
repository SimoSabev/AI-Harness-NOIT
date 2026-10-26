import { describe, expect, it } from "vitest";
import { demoWorld } from "@mandat/research";
import { liveState } from "./research-view";

describe("the live research panel (D-398)", () => {
  it("from the events alone: phase, plan, lanes, sources, claims, counters", async () => {
    const w = demoWorld();
    const r = await w.run();
    const s = liveState(w.events);
    expect(s.phase).toBe("done");
    expect(s.strategy).toBe(r.plan.strategy);
    expect(s.lanes.map((l) => [l.id, l.state])).toEqual([["l1", "done"], ["l2", "done"]]);
    expect(s.sources.map((x) => x.id).sort()).toEqual(r.sources.map((x) => x.id).sort());
    expect(s.claims.map((c) => c.verdict)).toEqual(r.claims.map((c) => c.verdict));
    expect(s.counts).toMatchObject({ pages: r.stats.pages_read, claims: r.stats.claims, quotes: r.stats.quotes });
    expect(s.roles.length).toBeGreaterThan(3);
    expect(s.cap).toBe(1);
  });
  it("while running: the phase and what each lane is doing now", async () => {
    const w = demoWorld();
    await w.run();
    const firstFetch = w.events.findIndex((e) => e.kind === "fetch");
    const s = liveState(w.events.slice(0, firstFetch + 1));
    expect(s.phase).toBe("read");
    expect(s.lanes.some((l) => l.state === "reading" && l.now !== null)).toBe(true);
    expect(s.finished).toBeNull();
    expect(liveState([]).phase).toBe("plan");
  });
});
