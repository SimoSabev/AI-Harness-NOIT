import { createHash } from "node:crypto";
import type { StreamEvent } from "@mandat/contract";
import type { Workbench } from "./workbench.js";

// E7д (v5 т. 3.5, D-310): the agent's live session → agent_sessions / tool_calls through the workbench writer.
// Leader = one session per run; each subagent = a session with the leader as parent. Beats and the realtime topic
// `session:<run_id>` are throttled to ≤ 2 per second per session; tool calls are written when their result (or a refusal)
// arrives, with the decision. A write failure never stops the run (it is logged).
export type SessionSink = Pick<Workbench, "session" | "beat" | "toolCall" | "end" | "lines">;
export interface RecorderOptions {
  taskId: string | null;
  repoId: string | null;
  agent: string;
  model: string;
  account: string | null;
  now?: () => number;
  broadcast?: (topic: string, event: string, payload: Record<string, unknown>) => Promise<void>;
  log?: (line: string) => void;
}
const BEAT_MS = 500;
const MAX_LINES = 50_000;

/** run id → s_<ulid lower>; run:child → s_<14 of the run>_<12 hex of the child> (both fit ^s_[a-z0-9_]{1,40}$). */
export function sessionIdFor(streamSession: string): string {
  const [run = "", child] = streamSession.split(":", 2);
  const r = run.replace(/^r_/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!child) return `s_${r.slice(0, 38)}`;
  return `s_${r.slice(0, 14)}_${createHash("sha256").update(child).digest("hex").slice(0, 12)}`;
}
const toolName = (s: string) => s.replace(/[^A-Za-z0-9_.:\-/*]/g, "_").slice(0, 120) || "unknown";

interface S {
  id: string;
  run: string;
  step: string;
  context: number | null;
  usd: number | null;
  touching: Set<string>;
  last: number;
  dirty: boolean;
  ended: boolean;
  pending: { kind: NonNullable<StreamEvent["tool"]>["kind"]; name: string; summary: string; at: number }[];
  /** terminal lines not yet written, and how many this session has */
  buf: { seq: number; kind: StreamEvent["kind"]; text: string }[];
  n: number;
}
/** One terminal line per event: the redacted text, or the tool and its decision. */
function lineOf(ev: StreamEvent): string {
  if (ev.tool) return `${ev.tool.name}${ev.tool.decision ? ` [${ev.tool.decision}]` : ""}${ev.text ? `: ${ev.text}` : ""}`;
  if (ev.usage) return `tokens in ${ev.usage.input} · out ${ev.usage.output}${ev.usage.usd !== null ? ` · $${ev.usage.usd.toFixed(4)}` : ""}`;
  if (ev.result) return `${ev.result.ok ? "done" : "failed"}${ev.result.error ? `: ${ev.result.error}` : ""}`;
  return ev.text ?? "";
}

export function sessionRecorder(sink: SessionSink, o: RecorderOptions) {
  const now = o.now ?? (() => Date.now());
  const sessions = new Map<string, S>();
  let queue: Promise<void> = Promise.resolve();
  let lastCast = Number.NEGATIVE_INFINITY;
  const run = (fn: () => Promise<void>) => {
    queue = queue.then(fn).catch((e: unknown) => o.log?.(`[session] write failed: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`));
  };
  const flush = (s: S, force: boolean) => {
    const t = now();
    if (!s.dirty || (!force && t - s.last < BEAT_MS)) return;
    if (s.buf.length > 0) {
      const rows = s.buf.splice(0);
      run(() => sink.lines(s.id, rows));
    }
    s.last = t;
    s.dirty = false;
    const beat = { step: s.step.slice(0, 120), ...(s.context !== null ? { context_pct: s.context } : {}), ...(s.usd !== null ? { usd: s.usd } : {}), touching: [...s.touching].slice(0, 200) };
    run(() => sink.beat(s.id, beat));
    if (o.broadcast && t - lastCast >= BEAT_MS) {
      lastCast = t;
      const cast = o.broadcast;
      const payload = { session: s.id, step: beat.step, context_pct: s.context, usd: s.usd, touching_count: s.touching.size };
      run(() => cast(`session:${s.run}`, "beat", payload));
    }
  };
  const ensure = (ev: StreamEvent): S => {
    const id = sessionIdFor(ev.session);
    let s = sessions.get(id);
    if (s) return s;
    s = { id, run: ev.session.split(":")[0] ?? ev.session, step: "starting", context: null, usd: null, touching: new Set(), last: Number.NEGATIVE_INFINITY, dirty: false, ended: false, pending: [], buf: [], n: 0 };
    sessions.set(id, s);
    const parent = ev.parent ? sessionIdFor(ev.parent) : null;
    const created = s;
    run(() =>
      sink.session(
        { id, task_id: o.taskId, parent_id: parent, agent: o.agent, model: o.model, account: o.account, role: parent ? "subagent" : "lead", state: "running", step: created.step, context_pct: null, usd: 0, touching: [] },
        o.repoId,
      ),
    );
    return s;
  };
  const writeCall = (s: S, c: S["pending"][number], decision: "allowed" | "denied" | "error") => {
    run(() => sink.toolCall({ session_id: s.id, kind: c.kind, tool: c.name, summary: c.summary, decision, duration_ms: Math.max(0, now() - c.at) }));
  };
  const take = (s: S, name: string) => {
    const i = s.pending.findIndex((p) => p.name === name);
    return i >= 0 ? s.pending.splice(i, 1)[0] : undefined;
  };
  const end = (s: S, state: "done" | "failed" | "idle") => {
    if (s.ended) return;
    s.dirty = true; // the last lines (e.g. the result) go out with the final beat
    flush(s, true);
    for (const c of s.pending.splice(0)) writeCall(s, c, "error");
    s.ended = true;
    run(() => sink.end(s.id, state));
  };
  return {
    push(ev: StreamEvent): void {
      const s = ensure(ev);
      if (s.n < MAX_LINES) s.buf.push({ seq: s.n++, kind: ev.kind, text: lineOf(ev) });
      switch (ev.kind) {
        case "init":
          s.step = "started";
          break;
        case "text":
        case "step":
          if (ev.text) s.step = ev.text.replace(/\s+/g, " ").slice(0, 120);
          break;
        case "tool_call":
          if (ev.tool) {
            const name = toolName(ev.tool.name);
            s.step = name;
            for (const p of ev.tool.touching) s.touching.add(p);
            s.pending.push({ kind: ev.tool.kind, name, summary: ev.text ?? name, at: now() });
          }
          break;
        case "tool_result":
        case "permission":
          if (ev.tool) {
            const c = take(s, toolName(ev.tool.name));
            const decision = ev.kind === "permission" || ev.tool.decision === "denied" ? "denied" : ev.tool.decision === "error" ? "error" : "allowed";
            if (c) writeCall(s, c, decision);
          }
          break;
        case "usage":
          if (ev.usage?.context_pct != null) s.context = ev.usage.context_pct;
          if (ev.usage?.usd != null) s.usd = ev.usage.usd;
          break;
        case "subagent_stop":
          end(s, ev.result && !ev.result.ok ? "failed" : "done");
          return;
        case "result":
          end(s, ev.result?.ok ? "done" : "failed");
          return;
        default:
          break;
      }
      s.dirty = true;
      flush(s, false);
    },
    /** proxy usage poll: the run's spend so far (the leader) */
    usd(runId: string, usd: number): void {
      const s = sessions.get(sessionIdFor(runId));
      if (!s || s.ended) return;
      s.usd = usd;
      s.dirty = true;
      flush(s, false);
    },
    async close(): Promise<void> {
      for (const s of sessions.values()) end(s, "idle");
      await queue;
    },
  };
}
export type SessionRecorder = ReturnType<typeof sessionRecorder>;
