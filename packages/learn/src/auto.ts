import { LEARN_LIMITS, jcs } from "@mandat/contract";
import type { ProfileChange, ProfileLayers } from "@mandat/contract";
import { isNarrowing, opensDangerous, removeChange } from "@mandat/profile";

// D-650 (Simo 26.11.2026, „за ученето да е автоматично, а не ръчно“): no learned proposal waits for a person.
// - gateDecision: the bench of the task type's contract, current profile against changed. Worse → not applied. A change
//   that can weaken the verdict (a flaky test, an allowed tool) also needs the held-out set and no false VERIFIED on
//   either set; it is then watched for regressions. A narrowing keeps D-530: not worse is enough, watched by its
//   prediction. Nothing that breaks a hard rule of AGENTS.md is ever applied (keepsHardRules).
// - watchDecision: a weakening change rolls itself back when the share of failures of its task type gets worse than
//   before it, or a model regression card (D-642) comes for a week the watch overlaps.
// - undoChange: the layers back to what the change replaced, keeping everything that came after it.

export interface Score { pass: number; total: number; false_verified: number }
/** the visible scenarios plus, when run, the held-out heavy set (D-550) */
export interface BenchScore extends Score { heldout?: Score }
export type GateDecision = { apply: true; watch: "prediction" | "regression"; why: string } | { apply: false; why: string };

/** a flaky test stops counting a failing test; an allowed tool stops asking: both can weaken the verdict */
export function weakens(c: ProfileChange): boolean {
  return c.rule === "flaky_test" || c.rule === "tool_allow";
}

const same = (a: unknown, b: unknown) => jcs(a) === jcs(b);
/** never a learned allow: a way out of the sandbox (net:*, git push), a write, or Mandat's own tools */
const neverAllowed = (tool: string) => opensDangerous(tool, null, "allow") || tool.startsWith("path:write:") || tool.startsWith("mandat:");

/**
 * AGENTS.md: learning never touches protected_paths (nor any other part of layer A but a longer tests.flaky), never
 * layers E–H, and never allows a way out of the sandbox. Keys and SANDBOX_HARDENING are not in the profile at all.
 */
export function keepsHardRules(before: ProfileLayers, after: ProfileLayers): boolean {
  const { flaky: fb, ...tb } = before.a.tests;
  const { flaky: fa, ...ta } = after.a.tests;
  if (!same({ ...before.a, tests: tb }, { ...after.a, tests: ta })) return false;
  if (!(fb ?? []).every((x) => (fa ?? []).includes(x))) return false;
  if (!same(before.e, after.e) || !same(before.f, after.f) || !same(before.g, after.g) || !same(before.h, after.h)) return false;
  const allowed = new Set(before.c.filter((r) => r.decision === "allow").map((r) => `${r.subject}\u0000${r.tool}`));
  return after.c.every((r) => r.decision !== "allow" || allowed.has(`${r.subject}\u0000${r.tool}`) || !neverAllowed(r.tool));
}

const worse = (a: Score, b: Score) => a.pass < b.pass || a.false_verified > b.false_verified;
const frac = (s: Score) => `${s.pass}/${s.total}`;

export function gateDecision(o: { layers: ProfileLayers; candidate: ProfileLayers; change: ProfileChange; before: BenchScore; after: BenchScore; requireHeldout: boolean }): GateDecision {
  const { before, after } = o;
  if (!keepsHardRules(o.layers, o.candidate)) return { apply: false, why: "the change breaks a hard rule of AGENTS.md: never applied" };
  if (worse(after, before)) return { apply: false, why: `the bench got worse: ${frac(after)} vs ${frac(before)}` };
  if (before.heldout && after.heldout && worse(after.heldout, before.heldout)) return { apply: false, why: `the held-out bench got worse: ${frac(after.heldout)} vs ${frac(before.heldout)}` };
  const narrowing = !weakens(o.change) && isNarrowing(o.layers, o.candidate);
  if (!narrowing) {
    if (!before.heldout || !after.heldout) return { apply: false, why: "a change that can weaken the verdict needs the held-out bench, and it did not run" };
    if (after.false_verified > 0 || after.heldout.false_verified > 0) return { apply: false, why: `false VERIFIED on the bench with the change (${after.false_verified} + ${after.heldout.false_verified} held-out)` };
    return { apply: true, watch: "regression", why: `the bench held with no false VERIFIED: ${frac(after)}, held-out ${frac(after.heldout)}; watched for regressions` };
  }
  if (o.requireHeldout && (!before.heldout || !after.heldout)) return { apply: false, why: "the held-out bench did not run" };
  return { apply: true, watch: "prediction", why: `the bench held: ${frac(after)}` };
}

/** the layers without the change: what it replaced comes back from `from`; what came after it stays */
export function undoChange(current: ProfileLayers, from: ProfileLayers, c: ProfileChange): ProfileLayers {
  if (c.rule === "tool_allow" || c.rule === "tool_deny") {
    const mine = (r: { subject: string; tool: string }) => r.subject === "any" && r.tool === c.detail;
    return { ...current, c: [...current.c.filter((r) => !mine(r)), ...from.c.filter(mine)] };
  }
  return removeChange(current, c);
}

export interface WatchRow { at: string; /** not VERIFIED, or a merged change that failed afterwards (a revert) */ bad: boolean }
export interface WatchDecision { action: "wait" | "keep" | "rollback"; why: string; seen: number; share_before: number | null; share_after: number | null }

const DAY = 86_400_000;
const time = (x: string) => Date.parse(x);
/** 00:00 UTC of the Monday after t */
function nextMonday(t: number): number {
  const d = new Date(t);
  const day = d.getUTCDay();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (((8 - day) % 7) || 7));
}

export function watchDecision(o: { applied_at: string; now: string; before: readonly WatchRow[]; after: readonly WatchRow[]; regressions: readonly { week: string }[] }): WatchDecision {
  const applied = time(o.applied_at);
  const now = time(o.now);
  const ok = (r: WatchRow) => Number.isFinite(time(r.at));
  const win = o.after.filter((r) => ok(r) && time(r.at) > applied).sort((a, b) => time(a.at) - time(b.at)).slice(0, LEARN_LIMITS.watch_n);
  const prior = o.before.filter((r) => ok(r) && time(r.at) <= applied).sort((a, b) => time(b.at) - time(a.at)).slice(0, LEARN_LIMITS.watch_before);
  const seen = win.length;
  const full = seen >= LEARN_LIMITS.watch_n;
  const end = full ? time((win[seen - 1] as WatchRow).at) : now;
  const share = (rs: readonly WatchRow[]) => (rs.length === 0 ? null : rs.filter((r) => r.bad).length / rs.length);
  const sb = share(prior);
  const sa = share(win);
  const out = (action: WatchDecision["action"], why: string): WatchDecision => ({ action, why, seen, share_before: sb, share_after: sa });
  // a regression card is for a week (Monday UTC); it counts when that week overlaps the watch
  const hit = o.regressions.find((r) => {
    const w = Date.parse(`${r.week}T00:00:00.000Z`);
    return Number.isFinite(w) && w <= end && w + 7 * DAY > applied;
  });
  if (hit) return out("rollback", `a model regression (D-642) in the week of ${hit.week}, after the change`);
  if (seen < LEARN_LIMITS.watch_min) return out("wait", `${seen} task(s) after the change`);
  if ((sa ?? 0) > (sb ?? 0)) return out("rollback", `failures got worse: ${pct(sa)} after the change vs ${pct(sb)} before`);
  // over: the window is full and the card of its last week had a day to come
  if (full && now >= nextMonday(end) + DAY) return out("keep", `not worse over ${seen} tasks: ${pct(sa)} vs ${pct(sb)}`);
  return out("wait", `not worse so far: ${pct(sa)} vs ${pct(sb)} over ${seen} task(s)`);
}
const pct = (x: number | null) => `${Math.round((x ?? 0) * 100)}%`;
