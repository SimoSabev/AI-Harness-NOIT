import { describe, expect, it } from "vitest";
import { pgliteDb } from "../../../worker/src/online/pglite-db.test-helper";
import { BOARD_STATES, COLUMNS, boardColumn, isInboxItem } from "./board";

// Демо промпт т. 8.1: every state → exactly one column; a FAILED verdict is always column 5; the TS copy equals SQL.
const results = [null, "VERIFIED", "FAILED", "UNKNOWN"] as const;

describe("board column", () => {
  it("7 колони точно, с имената от т. 8.1", () => {
    expect(COLUMNS.map((c) => c.title)).toEqual(["Нови", "Работи", "Проверява", "Чака теб", "Блокирано / Провал", "Доставено", "Резултат"]);
  });

  it("всяко състояние → точно една колона; ПРОВАЛ винаги в 5", () => {
    for (const state of BOARD_STATES)
      for (const result of results)
        for (const approval_needed of [false, true])
          for (const outcome_decided of [false, true]) {
            const c = boardColumn({ state, result, approval_needed, outcome_decided });
            expect(c).toBeGreaterThanOrEqual(1);
            expect(c).toBeLessThanOrEqual(7);
            if (result === "FAILED") expect(c).toBe(5);
          }
    expect(boardColumn({ state: "GATED", result: "VERIFIED", approval_needed: false, outcome_decided: false })).toBe(3);
    expect(boardColumn({ state: "GATED", result: "VERIFIED", approval_needed: true, outcome_decided: false })).toBe(4);
    expect(boardColumn({ state: "OUTCOME", result: "VERIFIED", approval_needed: false, outcome_decided: true })).toBe(7);
    expect(boardColumn({ state: "OUTCOME", result: "VERIFIED", approval_needed: false, outcome_decided: false })).toBe(6);
  });

  it("съвпада с public.board_column в базата за всички комбинации", async () => {
    const db = await pgliteDb();
    try {
      for (const state of BOARD_STATES)
        for (const result of results)
          for (const approval_needed of [false, true])
            for (const outcome_decided of [false, true]) {
              const r = await db.query<{ c: number }>("select public.board_column($1, $2, null, $3, $4) as c", [state, result, approval_needed, outcome_decided]);
              expect([state, result, approval_needed, outcome_decided, r.rows[0]?.c]).toEqual([state, result, approval_needed, outcome_decided, boardColumn({ state, result, approval_needed, outcome_decided })]);
            }
    } finally {
      await db.end();
    }
  });

  it("inbox: решение по вратата + BLOCKED с всяка причина освен stopped", () => {
    const base = { result: null, approval_needed: false, wait_reason: null };
    expect(isInboxItem({ ...base, state: "HELD" })).toBe(true);
    expect(isInboxItem({ ...base, state: "GATED", approval_needed: true })).toBe(true);
    expect(isInboxItem({ ...base, state: "GATED" })).toBe(false);
    expect(isInboxItem({ ...base, state: "BLOCKED", wait_reason: "budget" })).toBe(true);
    expect(isInboxItem({ ...base, state: "BLOCKED", wait_reason: "stopped" })).toBe(false);
    expect(isInboxItem({ ...base, state: "RUNNING" })).toBe(false);
  });
});
