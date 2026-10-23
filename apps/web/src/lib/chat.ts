// The workspace chat: the agent's stream lines (session_lines, already redacted by the worker) → what the person reads,
// and the task's state → the build pipeline on the right. Pure, so the browser and the tests share it.
export interface StreamLine { seq: number; kind: string; text: string; at: string }
export interface SteerLine { text: string; at: string }

/** What the live view reads of a task (a subset of the server's TaskRow; client modules never import lib/server). */
export interface FeedTask {
  id: string; text: string; agent: string; state: string; last_result: string | null; wait_reason: string | null; approval_needed: boolean;
  approved_by_human: boolean; steerable?: boolean; usd: number; updated_at: string; verdict_id: string | null; reasons: string[];
  changeset_id: string | null; head_sha: string | null; requires_second_factor: boolean;
}
/** One live update of a task (GET /api/tasks/:id/stream, event "feed"). */
export interface Feed {
  task: FeedTask;
  /** the latest leader session; a new one (a retry) restarts the client's cursor */
  session: string | null;
  lines: StreamLine[];
  touching: string[];
  context_pct: number | null;
  steers: SteerLine[];
}
export interface FeedCheck { detector: string; status: string; summary: string; signature: string | null }

export type ToolState = "run" | "ok" | "denied" | "error";
export type ChatItem =
  | { kind: "say"; seq: number; at: string; text: string }
  | { kind: "tool"; seq: number; at: string; name: string; summary: string; state: ToolState; output: string | null }
  | { kind: "sub"; seq: number; at: string; text: string; start: boolean }
  | { kind: "end"; seq: number; at: string; ok: boolean; text: string }
  | { kind: "steer"; seq: number; at: string; text: string };

/** "Name [decision]: text" / "Name: text" / "Name" — the worker's line of a tool event (session-recorder lineOf). */
function parseTool(text: string): { name: string; decision: string | null; rest: string } {
  const m = /^([^\s:[]+)(?: \[([a-z_]+)\])?(?:: ([\s\S]*))?$/.exec(text);
  if (!m) return { name: text.slice(0, 120), decision: null, rest: "" };
  return { name: m[1] ?? "", decision: m[2] ?? null, rest: m[3] ?? "" };
}

/** The agent's summary as the person reads it: no repeated tool name, paths relative to the repo (the sandbox's /m/work). */
const WORK = "/m/work";
function tidy(name: string, summary: string): string {
  let s = summary.startsWith(`${name} `) ? summary.slice(name.length + 1) : summary;
  s = s.replace(/^cd \/m\/work\/?\s*(;|&&)\s*/, "");
  return s.split(`${WORK}/`).join("");
}

export function chatItems(lines: StreamLine[], steers: SteerLine[] = []): ChatItem[] {
  const out: ChatItem[] = [];
  // the person's steers go in by time; they break the agent's text into two replies
  const timeline = [...lines, ...steers.map((s) => ({ seq: -1, kind: "steer", text: s.text, at: s.at }))]
    .map((l, i) => ({ l, i }))
    .sort((a, b) => a.l.at.localeCompare(b.l.at) || a.i - b.i)
    .map((p) => p.l);
  for (const l of steers.length === 0 ? lines : timeline) {
    switch (l.kind) {
      case "steer":
        out.push({ kind: "steer", seq: l.seq, at: l.at, text: l.text });
        break;
      case "text":
      case "step": {
        const last = out[out.length - 1];
        if (last?.kind === "say") last.text = `${last.text}\n${l.text}`;
        else if (l.text.trim() !== "") out.push({ kind: "say", seq: l.seq, at: l.at, text: l.text });
        break;
      }
      case "tool_call": {
        const p = parseTool(l.text);
        out.push({ kind: "tool", seq: l.seq, at: l.at, name: p.name, summary: tidy(p.name, p.rest), state: "run", output: null });
        break;
      }
      case "tool_result":
      case "permission": {
        const p = parseTool(l.text);
        const open = [...out].reverse().find((i): i is Extract<ChatItem, { kind: "tool" }> => i.kind === "tool" && i.state === "run" && i.name === p.name);
        if (!open) break;
        open.state = l.kind === "permission" || p.decision === "denied" ? "denied" : p.decision === "error" ? "error" : "ok";
        open.output = p.rest === "" ? null : p.rest;
        break;
      }
      case "subagent_start":
      case "subagent_stop":
        out.push({ kind: "sub", seq: l.seq, at: l.at, text: l.text, start: l.kind === "subagent_start" });
        break;
      case "result": {
        const ok = l.text.startsWith("done");
        out.push({ kind: "end", seq: l.seq, at: l.at, ok, text: l.text.replace(/^(done|failed)(: )?/, "") });
        break;
      }
      default:
        break; // init, usage, unparsed: the panel on the right shows what matters of them
    }
  }
  return out;
}

/** The last token/cost line of the stream ("tokens in X · out Y[ · $Z]"). */
export function usageOf(lines: StreamLine[]): { input: number; output: number; usd: number | null } | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l?.kind !== "usage") continue;
    const m = /^tokens in (\d+) · out (\d+)(?: · \$([0-9.]+))?/.exec(l.text);
    if (m) return { input: Number(m[1]), output: Number(m[2]), usd: m[3] ? Number(m[3]) : null };
  }
  return null;
}

export type StageKey = "sandbox" | "agent" | "export" | "judge" | "decision";
export type StageStatus = "todo" | "active" | "done" | "fail" | "warn";
const ORDER: StageKey[] = ["sandbox", "agent", "export", "judge", "decision"];
const AT: Record<string, number> = {
  PROVISIONING: 0, RUNNING: 1, RETRY: 1, EXPORTING: 2, VERIFY_1: 3, REBASING: 3, PUSHED: 3, VERIFY_2: 3, VERDICT: 3, GATED: 4, HELD: 4,
};

/** Where the task is: sandbox → agent → export → judge (Mandat) → the person's decision. */
export function stagesOf(t: { state: string; last_result: string | null }): { key: StageKey; status: StageStatus }[] {
  const done = (n: number) => ORDER.map((key, i) => ({ key, status: (i < n ? "done" : i === n ? "active" : "todo") as StageStatus }));
  if (t.state === "CREATED" || t.state === "CONTRACTED") return ORDER.map((key) => ({ key, status: "todo" }));
  if (t.last_result) {
    const judge: StageStatus = t.last_result === "VERIFIED" ? "done" : t.last_result === "FAILED" ? "fail" : "warn";
    const open = t.state === "HELD" || t.state === "GATED";
    return ORDER.map((key, i) => ({ key, status: i < 3 ? "done" : i === 3 ? judge : open && judge !== "fail" ? "active" : "done" }));
  }
  const at = AT[t.state];
  if (at !== undefined) return done(at);
  if (t.state === "BLOCKED") return ORDER.map((key, i) => ({ key, status: i === 0 ? "fail" : "todo" }));
  return ORDER.map((key) => ({ key, status: "done" }));
}

export type ToolIcon = "read" | "edit" | "run" | "search" | "plug" | "tool";
export function toolIcon(name: string): ToolIcon {
  if (name.startsWith("mcp__")) return "plug";
  if (name === "Read" || name === "NotebookRead") return "read";
  if (name === "Edit" || name === "MultiEdit" || name === "Write" || name === "NotebookEdit") return "edit";
  if (name === "Bash" || name === "BashOutput") return "run";
  if (name === "Grep" || name === "Glob" || name === "LS" || name === "WebSearch" || name === "WebFetch") return "search";
  return "tool";
}
