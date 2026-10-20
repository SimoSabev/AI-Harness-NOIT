// Демо промпт т. 5.8: the minimum state machine (без REBASING/PUSHED/VERIFY_2 — E1в).
export type TaskState =
  | "CREATED" | "CONTRACTED" | "PROVISIONING" | "RUNNING" | "EXPORTING" | "VERIFY_1" | "VERDICT" | "GATED" | "DELIVERED" | "HELD" | "BLOCKED" | "OUTCOME" | "CLOSED";

const NEXT: Record<TaskState, readonly TaskState[]> = {
  CREATED: ["CONTRACTED", "BLOCKED"],
  CONTRACTED: ["PROVISIONING", "BLOCKED"],
  PROVISIONING: ["RUNNING", "VERDICT", "BLOCKED"],
  RUNNING: ["EXPORTING", "VERDICT", "BLOCKED"],
  EXPORTING: ["VERIFY_1", "VERDICT", "BLOCKED"],
  VERIFY_1: ["VERDICT"],
  VERDICT: ["GATED"],
  GATED: ["DELIVERED", "HELD", "BLOCKED"],
  HELD: ["DELIVERED", "CLOSED"],
  DELIVERED: ["OUTCOME", "CLOSED"],
  BLOCKED: ["CLOSED", "CONTRACTED"],
  OUTCOME: ["CLOSED"],
  CLOSED: [],
};

export function canTransition(from: TaskState, to: TaskState): boolean {
  return NEXT[from].includes(to);
}

export function assertTransition(from: TaskState, to: TaskState): void {
  if (!canTransition(from, to)) throw new Error(`illegal transition ${from} → ${to}`);
}
