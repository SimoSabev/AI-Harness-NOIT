// T3-8 (демо промпт т. 3.4, D-211): every working state has a deadline; the sweeper never leaves a task "working" forever.

export type WorkingState = "PROVISIONING" | "RUNNING" | "EXPORTING" | "VERIFY_1" | "VERIFY_2" | "PUSHED";
export const WORKING_STATES: readonly WorkingState[] = ["PROVISIONING", "RUNNING", "EXPORTING", "VERIFY_1", "VERIFY_2", "PUSHED"];
export const DEFAULT_MAX_MIN: Record<Exclude<WorkingState, "RUNNING">, number> = { PROVISIONING: 10, EXPORTING: 10, VERIFY_1: 30, VERIFY_2: 60, PUSHED: 30 };
export const LEASE_SECONDS = 60;
export const SWEEP_SECONDS = 30;

/** MANDAT_STATE_MAX_MIN_<STATE> overrides; RUNNING = the task's task_minutes. */
export function stateMaxMinutes(state: WorkingState, env: Record<string, string | undefined>, taskMinutes: number): number {
  const v = Number(env[`MANDAT_STATE_MAX_MIN_${state}`]);
  if (Number.isFinite(v) && v > 0) return v;
  return state === "RUNNING" ? taskMinutes : DEFAULT_MAX_MIN[state];
}

export function deadlineFor(state: WorkingState, enteredAt: Date, env: Record<string, string | undefined>, taskMinutes: number): Date {
  return new Date(enteredAt.getTime() + stateMaxMinutes(state, env, taskMinutes) * 60_000);
}

export type StepKind = "provision" | "agent_run" | "export" | "baseline" | "verify" | "gate" | "deliver" | "outcome";
export interface OverdueTask {
  task_id: string;
  attempt: number;
  state: WorkingState;
  step: StepKind | null;
  /** the process (pid) or container (label run_id) behind the step is alive */
  alive: boolean;
  /** a verdict already exists for this attempt */
  hasVerdict: boolean;
}
export type SweepAction =
  | { kind: "extend"; task_id: string }
  | { kind: "verdict_unknown"; task_id: string; attempt: number; reason: "infra:lease_lost" }
  | { kind: "blocked"; task_id: string; attempt: number; reason: "runner_offline" }
  | { kind: "none"; task_id: string };

/**
 * Decision for an overdue task (спец. т. 4): alive → leave it; dead in verify/baseline → UNKNOWN infra:lease_lost;
 * dead in agent_run/export/provision → BLOCKED runner_offline without a verdict. Never a second verdict for one attempt.
 */
export function sweepDecision(t: OverdueTask): SweepAction {
  if (t.alive) return { kind: "extend", task_id: t.task_id };
  if (t.hasVerdict) return { kind: "none", task_id: t.task_id };
  if (t.step === "verify" || t.step === "baseline" || t.state === "VERIFY_1" || t.state === "VERIFY_2") {
    return { kind: "verdict_unknown", task_id: t.task_id, attempt: t.attempt, reason: "infra:lease_lost" };
  }
  return { kind: "blocked", task_id: t.task_id, attempt: t.attempt, reason: "runner_offline" };
}

/** idempotency_key = task_id + attempt + kind + try (т. 5.8). */
export const stepKey = (taskId: string, attempt: number, kind: StepKind, attemptTry: number): string => `${taskId}:${attempt}:${kind}:${attemptTry}`;
