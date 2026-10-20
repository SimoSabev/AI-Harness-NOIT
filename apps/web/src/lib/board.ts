// Демо промпт т. 8.1 / Ф4: the board. The column is computed on the server (public.board_column); this is the same
// function for the UI and the tests (board-column.test.ts checks it against SQL for every combination).
export const BOARD_STATES = ["CREATED", "CONTRACTED", "PROVISIONING", "RUNNING", "EXPORTING", "RETRY", "VERIFY_1", "REBASING", "PUSHED", "VERIFY_2", "VERDICT", "GATED", "DELIVERED", "HELD", "BLOCKED", "OUTCOME", "CLOSED"] as const;
export type BoardState = (typeof BOARD_STATES)[number];
export type VerdictResult = "VERIFIED" | "FAILED" | "UNKNOWN";
export type ColumnNo = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const COLUMNS: readonly { n: ColumnNo; title: string }[] = [
  { n: 1, title: "Нови" },
  { n: 2, title: "Работи" },
  { n: 3, title: "Проверява" },
  { n: 4, title: "Чака теб" },
  { n: 5, title: "Блокирано / Провал" },
  { n: 6, title: "Доставено" },
  { n: 7, title: "Резултат" },
];
export const PER_COLUMN = 20;

export function boardColumn(t: { state: BoardState; result: VerdictResult | null; approval_needed: boolean; outcome_decided: boolean }): ColumnNo {
  if (t.result === "FAILED") return 5;
  switch (t.state) {
    case "CREATED":
    case "CONTRACTED":
      return 1;
    case "PROVISIONING":
    case "RUNNING":
    case "EXPORTING":
    case "RETRY":
      return 2;
    case "VERIFY_1":
    case "REBASING":
    case "PUSHED":
    case "VERIFY_2":
    case "VERDICT":
      return 3;
    case "GATED":
      return t.approval_needed ? 4 : 3;
    case "HELD":
      return 4;
    case "BLOCKED":
      return 5;
    case "DELIVERED":
      return 6;
    case "OUTCOME":
      return t.outcome_decided ? 7 : 6;
    case "CLOSED":
      return 7;
  }
}

/** Ф4 S34: „Чака теб“ = a gate decision (HELD; GATED needing approval) + BLOCKED for any reason but stopped. */
export function isInboxItem(t: { state: string; approval_needed: boolean; blocked_reason: string | null }): boolean {
  if (t.state === "HELD") return true;
  if (t.state === "GATED") return t.approval_needed;
  if (t.state === "BLOCKED") return t.blocked_reason !== "stopped";
  return false;
}
