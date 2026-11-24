import type { Key } from "../i18n/t";
import { isAnswering } from "./conversation-types";
import type { ConversationFeed } from "./conversation-types";

// D-599: the path of a task, drawn as the strap of the brand kit: conversation → spec → oracle → work → seal.
// Pure: the stops come from the conversation's feed. A stop is done, running (the agents), waiting on you, failed, or
// not reached yet; the stops are sequential, so at most one waits on you.
export type StopId = "conversation" | "spec" | "oracle" | "work" | "seal";
export type StopState = "done" | "run" | "you" | "fail" | "todo";
export interface Stop { id: StopId; label: Key; state: StopState; count?: { n: number; of?: number } }

const STOPPED = new Set(["budget", "expired", "overloaded", "failed", "limit"]);

export function pathOf(f: ConversationFeed): Stop[] {
  const c = f.conversation;
  const approved = c.approved_spec_hash !== null;
  const ready = c.spec_ready;
  const talk: StopState = approved || ready ? "done" : isAnswering(c.status) ? "run" : STOPPED.has(c.status) ? "fail" : "you";
  const spec: StopState = approved ? "done" : ready ? "you" : "todo";

  const o = f.oracle ?? null;
  let oracle: StopState = "todo";
  if (approved) {
    if (f.oracle_required === false) oracle = "done";
    else if (!o || o.status === "building") oracle = "run";
    else if (o.status === "ready") oracle = "you";
    else if (o.status === "approved") oracle = "done";
    else oracle = "fail";
  }

  const j = f.job ?? null;
  let work: StopState = "todo";
  let seal: StopState = "todo";
  if (oracle === "done" && j) {
    if (j.status === "failed") work = "fail";
    else if (j.status === "parked" || j.question !== null) work = "you";
    else if (j.status === "planning" || j.status === "running") work = "run";
    else work = "done";
    if (j.merged_sha !== null || j.status === "delivered") seal = "done";
    else if (j.status === "sealed") seal = "you";
    else if (j.status === "converging" || j.status === "approved") seal = "run";
  }

  const passed = j ? j.units.filter((u) => u.status === "passed").length : 0;
  return [
    { id: "conversation", label: "path.conversation", state: talk },
    { id: "spec", label: "path.spec", state: spec },
    { id: "oracle", label: "path.oracle", state: oracle, ...(o && o.tests > 0 ? { count: { n: o.tests } } : {}) },
    { id: "work", label: "path.work", state: work, ...(j && j.units.length > 0 ? { count: { n: passed, of: j.units.length } } : {}) },
    { id: "seal", label: "path.seal", state: seal, ...(j && j.gates.length > 0 ? { count: { n: j.gates.length } } : {}) },
  ];
}
