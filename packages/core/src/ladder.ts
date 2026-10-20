// Стълба на доверието (спец. т. 7; демо промпт т. 5.5; D-208): CUSUM нагоре и надолу.
export const LADDER_STEP_SUCCESS = Math.log(0.95 / 0.85);
export const LADDER_STEP_FAILURE = Math.log(0.05 / 0.15);
export const H_UP_DEFAULT = 5;
export const H_DOWN_DEFAULT = 3.5;

export type LadderLevel = 0 | 1 | 2 | 3;
export interface LadderState {
  level: LadderLevel;
  s_up: number;
  s_down: number;
  pinned: boolean;
}
export type LadderInput = "success" | "failure" | "hard_fail" | "neutral";
export interface LadderStepResult {
  next: LadderState;
  delta: number;
  reason: "success" | "failure" | "hard_fail" | "none";
}

const clampLevel = (n: number): LadderLevel => Math.max(0, Math.min(3, n)) as LadderLevel;

export function ladderStep(s: LadderState, e: LadderInput, o: { h_up?: number; h_down?: number } = {}): LadderStepResult {
  const hUp = o.h_up ?? H_UP_DEFAULT;
  const hDown = o.h_down ?? H_DOWN_DEFAULT;
  if (e === "neutral") return { next: { ...s }, delta: 0, reason: "none" };
  if (e === "hard_fail") return { next: { level: 0, s_up: 0, s_down: 0, pinned: false }, delta: -s.level, reason: "hard_fail" };
  const step = e === "success" ? LADDER_STEP_SUCCESS : LADDER_STEP_FAILURE;
  const s_up = Math.max(0, s.s_up + step);
  const s_down = Math.max(0, s.s_down - step);
  if (!s.pinned && s_up >= hUp && s.level < 3) {
    return { next: { level: clampLevel(s.level + 1), s_up: 0, s_down: 0, pinned: false }, delta: 1, reason: e };
  }
  if (!s.pinned && s_down >= hDown && s.level > 0) {
    return { next: { level: clampLevel(s.level - 1), s_up: 0, s_down: 0, pinned: false }, delta: -1, reason: e };
  }
  return { next: { level: s.level, s_up, s_down, pinned: s.pinned }, delta: 0, reason: e };
}

/** Successes needed for the next level from this state; null at level 3. */
export function successesToNextLevel(s: LadderState, h_up: number = H_UP_DEFAULT): number | null {
  if (s.level === 3) return null;
  // The epsilon absorbs floating point noise in (h − s_up) / step (5 / 0.1112 = 44.97… → 45).
  return Math.max(1, Math.ceil((h_up - s.s_up) / LADDER_STEP_SUCCESS - 1e-9));
}

/** Seeded PRNG (mulberry32) so `mandat ladder sim` is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mean number of tasks until the first promotion from level 0 with success probability p. */
export function simulateLadder(o: { p: number; h: number; runs: number; seed: number; maxTasks?: number }): { mean: number; runs: number; censored: number } {
  const rnd = mulberry32(o.seed);
  const max = o.maxTasks ?? 100_000;
  let total = 0;
  let censored = 0;
  for (let r = 0; r < o.runs; r++) {
    let s: LadderState = { level: 0, s_up: 0, s_down: 0, pinned: false };
    let k = 0;
    while (s.level === 0 && k < max) {
      k++;
      s = ladderStep(s, rnd() < o.p ? "success" : "failure", { h_up: o.h }).next;
    }
    if (s.level === 0) censored++;
    total += k;
  }
  return { mean: total / o.runs, runs: o.runs, censored };
}
