import { LEARN_LIMITS, ProfileChange, ProfileManifest, sourceOfClass } from "@mandat/contract";
import type { ProfileLayers, TaskType } from "@mandat/contract";
import { hasChange, opensDangerous, rulesFromFailures as profileRules } from "@mandat/profile";
import type { FailureRow } from "@mandat/profile";
import { weakens } from "./auto.js";

// E9д (spec 5.5, PRD 6.11 т. 2, D-641): failures and asks → proposals for a new version of the harness profile. Each
// proposal is one fixed change with its evidence and its rule's name (`rule:<name>`); none is text a model wrote.
// - the eight D-530/D-549 classes come from packages/profile as they are (≥ 3 tasks of a type in 30 days; Mandat may
//   accept a narrowing one after the bench) and only get their name here;
// - flaky_repeat: a test that failed D1 in ≥ 2 tasks a person labelled as not the agent's fault → tests.flaky;
// - ask_repeat: ≥ 5 tasks asked for one tool and a person decided the same way in ≥ 80% → allow / deny of the tool.
// D-650: none waits for a person. Each goes through the bench gate (auto.ts); `weakens` marks the ones (flaky, allow)
// that need the stricter gate and the regression watch.

export interface LearnFailureRow extends FailureRow {
  /** the person's failure label of the task's verdict (failure_labels), if any */
  label: { layer: string; label: string } | null;
}
export interface AskRow { task_id: string; task_type: TaskType; tool: string; status: "pending" | "once" | "always" | "denied"; at: string }
export interface LearnedRule { manifest: ProfileManifest; /** D-650: can weaken the verdict (flaky, allow) */ weakens: boolean }

const DAY = 86_400_000;
/** a failure a person said was not the agent's: the checks or the infrastructure */
const NOT_AGENT = new Set(["verification", "infra"]);

export function rulesFromFailures(input: { failures: readonly LearnFailureRow[]; asks: readonly AskRow[] }, profile: ProfileLayers, now: string): LearnedRule[] {
  const t = Date.parse(now);
  const inWindow = (at: string) => {
    const x = Date.parse(at);
    return Number.isFinite(x) && x <= t && t - x <= LEARN_LIMITS.window_days * DAY;
  };
  const out: LearnedRule[] = [];
  for (const m of profileRules(input.failures, profile, now)) {
    const source = sourceOfClass(m.reason_class);
    out.push({ manifest: source ? { ...m, source } : m, weakens: weakens(m.change) });
  }
  out.push(...flaky(input.failures.filter((r) => inWindow(r.at)), profile));
  out.push(...asks(input.asks.filter((r) => inWindow(r.at)), profile));
  return out;
}

const mostCommon = (types: readonly TaskType[]): TaskType => {
  const n = new Map<TaskType, number>();
  for (const x of types) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? "bugfix";
};

/** builds the manifest through the contract; a change that does not read (a bad test id, a bad tool) is dropped */
function proposal(change: unknown, evidence: string[], types: TaskType[], reason_class: string, profile: ProfileLayers): LearnedRule | null {
  const c = ProfileChange.safeParse(change);
  if (!c.success || hasChange(profile, c.data)) return null;
  const source = sourceOfClass(reason_class);
  const m = ProfileManifest.safeParse({ change: c.data, evidence: evidence.slice(0, 50), reason_class, prediction: { task_type: mostCommon(types), next_n: 10, max_repeats: 0 }, ...(source ? { source } : {}) });
  return m.success ? { manifest: m.data, weakens: weakens(m.data.change) } : null;
}

function flaky(rows: readonly LearnFailureRow[], profile: ProfileLayers): LearnedRule[] {
  const byTest = new Map<string, { tasks: string[]; types: TaskType[] }>();
  for (const r of rows) {
    if (!r.label || !NOT_AGENT.has(r.label.layer)) continue;
    for (const reason of r.reasons) {
      if (!reason.startsWith("D1:regression:")) continue;
      const id = reason.slice("D1:regression:".length);
      const g = byTest.get(id) ?? { tasks: [], types: [] };
      if (g.tasks.includes(r.task_id)) continue;
      g.tasks.push(r.task_id);
      g.types.push(r.task_type);
      byTest.set(id, g);
    }
  }
  const out: LearnedRule[] = [];
  for (const [id, g] of [...byTest.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (g.tasks.length < LEARN_LIMITS.flaky_min || (profile.a.tests.flaky?.length ?? 0) >= 500) continue;
    const p = proposal({ rule: "flaky_test", layer: "a", detail: id }, g.tasks, g.types, "D1:regression", profile);
    if (p) out.push(p);
  }
  return out;
}

function asks(rows: readonly AskRow[], profile: ProfileLayers): LearnedRule[] {
  const byTool = new Map<string, Map<string, { grant: boolean; at: number; type: TaskType }>>();
  for (const r of rows) {
    if (r.status === "pending") continue;
    const tasks = byTool.get(r.tool) ?? new Map<string, { grant: boolean; at: number; type: TaskType }>();
    const at = Date.parse(r.at);
    const prev = tasks.get(r.task_id);
    // one vote per task: its latest decision
    if (!prev || at > prev.at) tasks.set(r.task_id, { grant: r.status !== "denied", at, type: r.task_type });
    byTool.set(r.tool, tasks);
  }
  const out: LearnedRule[] = [];
  for (const [tool, tasks] of [...byTool.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (tasks.size < LEARN_LIMITS.ask_min || profile.c.length >= 500) continue;
    const votes = [...tasks.entries()].sort((a, b) => b[1].at - a[1].at);
    const grants = votes.filter(([, v]) => v.grant).length;
    const allow = grants / votes.length >= LEARN_LIMITS.ask_share;
    const deny = (votes.length - grants) / votes.length >= LEARN_LIMITS.ask_share;
    if (!allow && !deny) continue;
    // never a way out of the sandbox (net:*, git push) as a learned allow (PRD 6.11 т. 7: no automatic widening of rights)
    if (allow && opensDangerous(tool, null, "allow")) continue;
    const p = proposal({ rule: allow ? "tool_allow" : "tool_deny", layer: "c", detail: tool }, votes.map(([id]) => id), votes.map(([, v]) => v.type), "ASK:tool_ask", profile);
    if (p) out.push(p);
  }
  return out;
}
