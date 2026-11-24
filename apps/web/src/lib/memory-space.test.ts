import { describe, expect, it } from "vitest";
import { KIND_COLOR, clusters, depthOf, project, timeLanes } from "./memory-space";
import { parseMemoryQuery } from "./memory-view";
import type { MemoryItem } from "@mandat/contract";

// D-599: the memory in several views — 3D threads (the graph lifted into space and turning), the 2D map, a timeline per
// kind, clusters per kind and the list. Each kind has its own colour; the same memories always draw the same picture.
const m = (o: Partial<MemoryItem>): MemoryItem => ({
  id: "11111111-1111-4111-8111-111111111111", scope: "user", kind: "fact", text: "x", status: "active", source: "human", basis: null, repo_id: null,
  entities: [], pinned: false, uses: 0, last_used_at: null, created_at: "2026-11-01T10:00:00.000Z", invalid_at: null, superseded_by: null, provenance: {}, ...o,
} as MemoryItem);

describe("memory views (D-599)", () => {
  it("the address knows the five views; anything else is the list", () => {
    for (const v of ["list", "graph", "threads", "time", "clusters"]) expect(parseMemoryQuery({ view: v }).view).toBe(v);
    expect(parseMemoryQuery({ view: "nope" }).view).toBe("list");
  });
  it("every kind has its own colour", () => {
    const colours = Object.values(KIND_COLOR);
    expect(colours).toHaveLength(7);
    expect(new Set(colours).size).toBe(7);
  });
  it("depth is seeded by the id: the same memory sits at the same depth, within [-1, 1]", () => {
    const a = depthOf("11111111-1111-4111-8111-111111111111");
    expect(depthOf("11111111-1111-4111-8111-111111111111")).toBe(a);
    expect(Math.abs(a)).toBeLessThanOrEqual(1);
    expect(depthOf("22222222-2222-4222-8222-222222222222")).not.toBe(a);
  });
  it("the projection turns around the vertical axis and shrinks what is far", () => {
    const front = project({ x: 0, y: 0, z: -1 }, 0, { cx: 500, cy: 350, r: 300 });
    const back = project({ x: 0, y: 0, z: 1 }, 0, { cx: 500, cy: 350, r: 300 });
    expect(front.s).toBeGreaterThan(back.s);
    const turned = project({ x: 1, y: 0, z: 0 }, Math.PI / 2, { cx: 500, cy: 350, r: 300 });
    expect(Math.round(turned.x)).toBe(500);
  });
  it("the timeline: one lane per kind present, each memory at its day between the first and the last", () => {
    const lanes = timeLanes([m({ id: "11111111-1111-4111-8111-111111111111", kind: "pitfall", created_at: "2026-11-01T00:00:00.000Z" }), m({ id: "22222222-2222-4222-8222-222222222222", kind: "command", created_at: "2026-11-21T00:00:00.000Z" })]);
    expect(lanes.map((l) => l.kind)).toEqual(["command", "pitfall"]);
    expect(lanes[1]?.items[0]?.at).toBe(0);
    expect(lanes[0]?.items[0]?.at).toBe(1);
  });
  it("clusters by kind, the biggest first", () => {
    const c = clusters([m({ kind: "fact" }), m({ kind: "fact", id: "22222222-2222-4222-8222-222222222222" }), m({ kind: "pitfall", id: "33333333-3333-4333-8333-333333333333" })]);
    expect(c.map((x) => [x.kind, x.items.length])).toEqual([["fact", 2], ["pitfall", 1]]);
  });
});
