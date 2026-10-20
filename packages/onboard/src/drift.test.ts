import { describe, expect, it } from "vitest";
import { FIXTURES, memView } from "./fixtures.test-helper.js";
import { drift } from "./drift.js";
import { propose } from "./propose.js";
import { scanRepo } from "./scan.js";

describe("drift (Поток 2 минимум)", () => {
  const a = propose(scanRepo(memView(FIXTURES["npm-vitest"] as Record<string, string>))).policy;
  it("без промяна → нищо", () => expect(drift(a, a)).toEqual({ hard: [], soft: [], stale: false }));
  it("runtime/tests/ci → harness_stale; бюджети → меко", () => {
    const pnpm = propose(scanRepo(memView(FIXTURES["pnpm-vitest"] as Record<string, string>))).policy;
    const d = drift(a, pnpm);
    expect(d.stale).toBe(true);
    expect(d.hard).toEqual(expect.arrayContaining(["runtime.install", "runtime.package_manager"]));
    const soft = drift(a, { ...a, budgets: { ...a.budgets, task_usd: 3 } });
    expect(soft).toEqual({ hard: [], soft: ["budgets.task_usd"], stale: false });
    expect(drift({ ...a, monorepo: "turbo" }, a).stale).toBe(true);
  });
});
