import { describe, expect, it } from "vitest";
import { inboxSummary, pageTitle, summaryLine } from "./inbox";

const now = new Date("2026-10-20T12:00:00Z");
const h = (n: number) => new Date(now.getTime() - n * 3600_000).toISOString();

describe("inbox summary (т. 8.1)", () => {
  it("последните 24 ч: слети сами, провали, чакат", () => {
    const s = inboxSummary(
      [
        { result: "VERIFIED", delivered: "merge", approved_by_human: false, decided_at: h(1), waiting: false },
        { result: "VERIFIED", delivered: "merge", approved_by_human: true, decided_at: h(2), waiting: false },
        { result: "VERIFIED", delivered: "merge", approved_by_human: false, decided_at: h(30), waiting: false },
        { result: "FAILED", delivered: null, approved_by_human: false, decided_at: h(3), waiting: false },
        { result: "VERIFIED", delivered: null, approved_by_human: false, decided_at: h(4), waiting: true },
        { result: null, delivered: null, approved_by_human: false, decided_at: null, waiting: true },
      ],
      now,
    );
    expect(s).toEqual({ autoMerged: 1, failed: 1, waiting: 2 });
    expect(summaryLine(s)).toBe("1 ПРОВЕРЕНО и слети сами · 1 ПРОВАЛ · 2 чакат теб");
    expect(summaryLine({ autoMerged: 0, failed: 0, waiting: 1 })).toBe("0 ПРОВЕРЕНО и слети сами · 0 ПРОВАЛ · 1 чака теб");
  });

  it("<title> с брояча", () => {
    expect(pageTitle(3)).toBe("3 чакат · Хамут");
    expect(pageTitle(1)).toBe("1 чака · Хамут");
    expect(pageTitle(0)).toBe("Хамут");
  });
});
