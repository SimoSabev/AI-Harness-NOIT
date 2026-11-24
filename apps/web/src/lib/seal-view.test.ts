import { describe, expect, it } from "vitest";
import { sealView } from "./seal-view";
import type { GateRow } from "./job-strategy";

// D-599: the seal of the brand kit — the verdict ringed by its gates, one tick per gate, lit as each gate reports.
const g = (statuses: GateRow["status"][]): GateRow[] => statuses.map((status, i) => ({ id: (["D1.base_tests", "D2.inventory", "D3.protected", "D4.contract", "D5.hidden", "D8.static", "D11.mutation", "D11.oracle", "D13.cheat", "D14.perf"] as const)[i] ?? "D1.base_tests", status }));

describe("sealView (D-599)", () => {
  it("before the final check every tick is unlit and the centre waits", () => {
    const v = sealView(g(Array(10).fill("pending")), null);
    expect(v.ticks.every((x) => x === "todo")).toBe(true);
    expect(v.center).toBe("waiting");
    expect(v.done).toBe(0);
  });
  it("while checking, the reported gates light and the centre counts", () => {
    const v = sealView(g(["pass", "pass", "pass", "pending", "pending"]), null);
    expect(v.ticks).toEqual(["pass", "pass", "pass", "todo", "todo"]);
    expect(v.center).toBe("checking");
    expect(v).toMatchObject({ done: 3, of: 5 });
  });
  it("a verdict sets the centre; an unknown gate is amber, a failed one coral, n/a stays unlit", () => {
    const v = sealView(g(["pass", "unknown", "fail", "n/a"]), "UNKNOWN");
    expect(v.ticks).toEqual(["pass", "ask", "fail", "na"]);
    expect(v.center).toBe("unknown");
    expect(sealView(g(["pass"]), "VERIFIED").center).toBe("verified");
    expect(sealView(g(["fail"]), "FAILED").center).toBe("failed");
  });
});
