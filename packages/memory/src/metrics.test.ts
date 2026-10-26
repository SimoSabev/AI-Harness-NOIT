import { describe, expect, it } from "vitest";
import { REPO, mem } from "./items.test-helper.js";
import { memoryTokens, usageSummary } from "./metrics.js";

describe("токените на паметта (D-400)", () => {
  it("цялата активна памет срещу ядрото на проекта", () => {
    const items = Array.from({ length: 50 }, (_, i) => mem(`Факт номер ${i} за проекта и неговите команди`, { scope: "project", repo_id: REPO }));
    const t = memoryTokens(items, REPO);
    expect(t.all).toBeGreaterThan(t.core);
    expect(t.core).toBeLessThanOrEqual(800 + 500);
    expect(t.active).toBe(50);
  });
  it("обобщение по задачи: средно, най-много и спестеното спрямо „всичко в контекста“", () => {
    expect(usageSummary([{ core_tokens: 300, recall_tokens: 100 }, { core_tokens: 300, recall_tokens: 300 }], 4000)).toEqual({ runs: 2, avg: 500, max: 600, saved_pct: 88 });
    expect(usageSummary([], 4000)).toEqual({ runs: 0, avg: 0, max: 0, saved_pct: 0 });
    expect(usageSummary([{ core_tokens: 10, recall_tokens: 0 }], 0).saved_pct).toBe(0);
  });
});
