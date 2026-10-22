import { createHash } from "node:crypto";
import type { AgentEvent } from "@mandat/agents";
import { redactSummary } from "@mandat/contract";
import type { AgentSessionInput, ToolCallInput } from "@mandat/contract";
import type { Workbench } from "./workbench.js";

// D-308: the agent's own stream → the workbench records (agents, subagents, tool calls, touched files, cost).
// sessionMapper is pure (events in, record ops out, time from the caller); recorder applies the ops in order and never
// fails the task: the first failed write stops recording with one warning and no data in it.

export type RecordOp =
  | { op: "session"; input: AgentSessionInput }
  | { op: "beat"; id: string; beat: { step?: string; usd?: number; touching?: string[] } }
  | { op: "call"; input: ToolCallInput }
  | { op: "end"; id: string; state: "done" | "failed" };

const WORKDIR = "/m/work/";
const WRITES = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const SUBAGENT = new Set(["Task", "Agent"]);
const SUMMARY_KEYS = ["file_path", "notebook_path", "path", "pattern", "url", "query", "command", "description", "prompt"] as const;

/** s_<task>_a<attempt>; subagents add _<n>. A long task id is cut and hashed so the id fits SessionId (≤ 40). */
export function sessionIds(taskId: string, attempt: number): { lead: string; sub: (n: number) => string } {
  const raw = taskId.replace(/^t_/, "");
  const tid = raw.length > 24 ? `${raw.slice(0, 15)}_${createHash("sha256").update(raw).digest("hex").slice(0, 8)}` : raw;
  const lead = `s_${tid}_a${attempt}`;
  return { lead, sub: (n) => `${lead}_${n}` };
}

const rel = (p: unknown): string | null => {
  if (typeof p !== "string" || p === "") return null;
  const r = p.startsWith(WORKDIR) ? p.slice(WORKDIR.length) : p;
  if (r === "" || r.startsWith("/") || r.split("/").includes("..") || r.length > 256) return null;
  return r;
};
const field = (input: unknown, k: string): unknown => (input !== null && typeof input === "object" ? (input as Record<string, unknown>)[k] : undefined);
const toolName = (s: string): string => s.replace(/[^A-Za-z0-9_.:\-/*]/g, "_").slice(0, 120) || "unknown";

export interface ToolClass {
  kind: ToolCallInput["kind"];
  tool: string;
  summary: string;
  /** files this call writes (relative to the work tree), for "who is touching what" */
  paths: string[];
  subagent: boolean;
}
export function classifyTool(name: string, input: unknown): ToolClass {
  const listed = field(input, "paths");
  const paths = [field(input, "file_path"), field(input, "notebook_path"), ...(Array.isArray(listed) ? listed : [])].map(rel).filter((p): p is string => p !== null);
  if (name.startsWith("mcp__")) {
    const [, server = "", ...rest] = name.split("__");
    return { kind: "mcp", tool: toolName(`${server}.${rest.join("__")}`), summary: JSON.stringify(input ?? null), paths: [], subagent: false };
  }
  if (name === "Skill") {
    const skill = field(input, "skill") ?? field(input, "command");
    const args = field(input, "args");
    return { kind: "skill", tool: toolName(typeof skill === "string" ? skill : "Skill"), summary: typeof args === "string" ? args : "", paths: [], subagent: false };
  }
  const first = SUMMARY_KEYS.map((k) => field(input, k)).find((v): v is string => typeof v === "string");
  const summary = paths.length > 0 ? paths.join(" ") : first === undefined ? "" : (rel(first) ?? first);
  if (name === "Bash") return { kind: "bash", tool: "Bash", summary, paths: [], subagent: false };
  return { kind: "builtin", tool: toolName(name), summary, paths: WRITES.has(name) ? paths : [], subagent: SUBAGENT.has(name) };
}

/** D-308: what the gate refused for the agent's tree, aggregated (run.ts reads the gate log at the end of the run). */
export interface GateBlock { kind: "dns_block" | "proxy_block"; target: string; count: number }

interface Pending { session: string; name: string; c: ToolClass; t0: number; sub: string | null }

export interface MapperInput {
  taskId: string;
  attempt: number;
  agent: string;
  model: string;
  account: string | null;
  now: () => number;
}
export function sessionMapper(o: MapperInput) {
  const ids = sessionIds(o.taskId, o.attempt);
  const secrets: string[] = [];
  const pending = new Map<string, Pending>();
  const seen = new Set<string>();
  const subs = new Map<string, string>(); // Task tool_use id → child session id
  const touching = new Map<string, string[]>();
  const open: string[] = [];
  let opened = false;
  let closed = false;
  let model = o.model;
  let resultState: "done" | "failed" | null = null;
  let n = 0;

  const scrub = (s: string): string => secrets.reduce((a, x) => a.split(x).join("[скрито]"), s);
  const session = (id: string, parent: string | null, step: string): RecordOp => ({
    op: "session",
    input: { id, task_id: o.taskId, parent_id: parent, agent: o.agent.slice(0, 64), model: model.slice(0, 64) || "unknown", account: o.account?.slice(0, 64) ?? null, role: parent ? "subagent" : "lead", state: "running", step: redactSummary(scrub(step)).slice(0, 120), context_pct: null, usd: 0, touching: [] },
  });
  const lead = (ops: RecordOp[]): void => {
    if (opened) return;
    opened = true;
    open.push(ids.lead);
    ops.push(session(ids.lead, null, "започва"));
  };
  const call = (p: Pending, decision: ToolCallInput["decision"], ms: number | null): RecordOp => ({ op: "call", input: { session_id: p.session, kind: p.c.kind, tool: p.c.tool, summary: scrub(p.c.summary), decision, duration_ms: ms } });
  const finish = (id: string, p: Pending, decision: ToolCallInput["decision"], ms: number | null, ops: RecordOp[]): void => {
    pending.delete(id);
    ops.push(call(p, decision, ms));
    if (p.sub) {
      const i = open.indexOf(p.sub);
      if (i >= 0) open.splice(i, 1);
      ops.push({ op: "end", id: p.sub, state: decision === "allowed" ? "done" : "failed" });
    }
  };

  return {
    /** a secret value (the canary) that must never reach a record */
    secret(v: string): void {
      if (v) secrets.push(v);
    },
    push(e: AgentEvent): RecordOp[] {
      if (closed) return [];
      const ops: RecordOp[] = [];
      if (e.type === "init") {
        if (e.model) model = e.model;
        lead(ops);
        return ops;
      }
      if (e.type !== "tool_use" && e.type !== "tool_result" && e.type !== "permission_denied" && e.type !== "result") return ops;
      lead(ops);
      if (e.type === "tool_use") {
        if (seen.has(e.id)) return ops;
        seen.add(e.id);
        const owner = (e.parent && subs.get(e.parent)) || ids.lead;
        const c = classifyTool(e.name, e.input);
        const step = redactSummary(scrub(`${c.tool} ${c.summary}`)).slice(0, 120);
        const had = touching.get(owner) ?? [];
        const more = c.paths.filter((p) => !had.includes(p));
        if (more.length > 0) touching.set(owner, [...had, ...more].slice(0, 200));
        ops.push({ op: "beat", id: owner, beat: { step, ...(more.length > 0 ? { touching: touching.get(owner) ?? [] } : {}) } });
        let sub: string | null = null;
        if (c.subagent) {
          sub = ids.sub(++n);
          subs.set(e.id, sub);
          open.push(sub);
          ops.push(session(sub, owner, c.summary || c.tool));
        }
        pending.set(e.id, { session: owner, name: e.name, c, t0: o.now(), sub });
      } else if (e.type === "tool_result") {
        const p = pending.get(e.toolUseId);
        if (p) finish(e.toolUseId, p, e.isError ? "error" : "allowed", Math.max(0, Math.round(o.now() - p.t0)), ops);
      } else if (e.type === "permission_denied") {
        const hit = [...pending.entries()].reverse().find(([, p]) => p.name === e.tool);
        if (hit) finish(hit[0], hit[1], "denied", null, ops);
        else ops.push(call({ session: ids.lead, name: e.tool, c: { ...classifyTool(e.tool, null), summary: "" }, t0: 0, sub: null }, "denied", null));
      } else {
        resultState = e.isError ? "failed" : "done";
        if (e.totalCostUsd !== null) ops.push({ op: "beat", id: ids.lead, beat: { usd: Math.min(10_000, Math.max(0, e.totalCostUsd)) } });
      }
      return ops;
    },
    /** the gate's refusals: denied `mandat` calls on the lead */
    gate(blocks: GateBlock[]): RecordOp[] {
      if (closed || blocks.length === 0) return [];
      const ops: RecordOp[] = [];
      lead(ops);
      for (const b of blocks) {
        const c: ToolClass = { kind: "mandat", tool: b.kind === "dns_block" ? "gate.dns" : "gate.http", summary: `${b.target} ×${b.count}`, paths: [], subagent: false };
        ops.push(call({ session: ids.lead, name: c.tool, c, t0: 0, sub: null }, "denied", null));
      }
      return ops;
    },
    /** the run is over: unfinished calls are errors; open subagents and the lead end */
    close(ok: boolean): RecordOp[] {
      if (closed || !opened) {
        closed = true;
        return [];
      }
      closed = true;
      const ops: RecordOp[] = [];
      const state = resultState ?? (ok ? "done" : "failed");
      for (const [id, p] of [...pending.entries()]) {
        pending.delete(id);
        ops.push(call(p, "error", null));
      }
      for (const id of open.filter((s) => s !== ids.lead)) ops.push({ op: "end", id, state });
      ops.push({ op: "end", id: ids.lead, state });
      return ops;
    },
    leadId: ids.lead,
  };
}
export type SessionMapper = ReturnType<typeof sessionMapper>;

export function recorder(wb: Workbench, repoId: string | null, m: SessionMapper, warn: (line: string) => void) {
  let chain: Promise<void> = Promise.resolve();
  let stopped = false;
  const apply = async (op: RecordOp): Promise<void> => {
    if (op.op === "session") await wb.session(op.input, repoId);
    else if (op.op === "beat") await wb.beat(op.id, op.beat);
    else if (op.op === "call") await wb.toolCall(op.input);
    else await wb.end(op.id, op.state);
  };
  const run = (ops: RecordOp[]): void => {
    if (ops.length === 0) return;
    chain = chain.then(async () => {
      for (const op of ops) {
        if (stopped) return;
        try {
          await apply(op);
        } catch (e) {
          stopped = true;
          warn(`recorder stopped (D-308): ${e instanceof Error ? e.name : "unknown"}`);
        }
      }
    });
  };
  return {
    secret: (v: string) => m.secret(v),
    event(e: AgentEvent): void {
      if (!stopped) run(m.push(e));
    },
    gate(blocks: GateBlock[]): void {
      if (!stopped) run(m.gate(blocks));
    },
    async close(ok: boolean): Promise<void> {
      run(m.close(ok));
      await chain;
    },
  };
}
export type Recorder = ReturnType<typeof recorder>;
