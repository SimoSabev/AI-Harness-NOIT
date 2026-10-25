import { sha256Tag } from "@mandat/contract";
import type { ParsedReport, TestStatus } from "@mandat/contract";
import type { Detected } from "./canary.js";
import { ev } from "./evidence.js";

// v5 E9б (5.2): D5 hidden tests. A person's tests live outside the repo and are copied into tree B only (after the
// export, before install); the agent never has them. Their names never reach the agent: the signature carries a hash and
// the evidence is not agent-visible (a retry note or a night question is built from signatures).
export interface HiddenResult { id: string; status: TestStatus }

/** "h" + the first 8 hex of sha256(test id) */
export const hiddenId = (id: string): string => `h${sha256Tag(id).slice("sha256:".length, "sha256:".length + 8)}`;

/** the tests under the hidden directory go to D5; the rest go on to D1, D2, MUST_PASS and D11 unchanged */
export function splitHidden(r: ParsedReport, dir: string): { visible: ParsedReport; hidden: HiddenResult[] } {
  if (!r.valid) return { visible: r, hidden: [] };
  const prefix = `${dir.replace(/\/+$/, "")}/`;
  const visible = new Map<string, TestStatus>();
  const hidden: HiddenResult[] = [];
  for (const [id, status] of r.tests) {
    if (id.startsWith(prefix)) hidden.push({ id, status });
    else visible.set(id, status);
  }
  return { visible: { valid: true, success: ![...visible.values()].includes("failed"), total: visible.size, tests: visible }, hidden };
}

export function d5Hidden(o: { hidden: HiddenResult[]; files: number }): Detected {
  const quiet = (e: ReturnType<typeof ev>) => ({ ...e, agent_visible: false });
  if (o.hidden.length === 0) return { evidence: quiet(ev("D5.hidden", "unknown", `${o.files} hidden test file(s) did not run`, { files: o.files }, { cls: "not_run", id: String(o.files) })), security: [] };
  const failed = o.hidden.filter((h) => h.status === "failed");
  if (failed.length === 0) return { evidence: quiet(ev("D5.hidden", "pass", `${o.hidden.length}/${o.hidden.length} hidden test(s) passed`, { passed: o.hidden.length })), security: [] };
  return {
    evidence: quiet(ev("D5.hidden", "fail", `${failed.length} of ${o.hidden.length} hidden test(s) failed`, { failed: failed.map((h) => h.id).slice(0, 50) }, { cls: "hidden_fail", id: hiddenId((failed[0] as HiddenResult).id) })),
    security: [],
  };
}
