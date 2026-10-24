// The workspace chat: the agent's stream lines (session_lines, already redacted by the worker) → what the person reads.
// Pure, so the browser and the tests share it.
export interface StreamLine { seq: number; kind: string; text: string; at: string }
export interface SteerLine { text: string; at: string }

/** What the live view reads of a task (a subset of the server's TaskRow; client modules never import lib/server). */
export interface FeedTask {
  id: string; text: string; agent: string; state: string; last_result: string | null; wait_reason: string | null; approval_needed: boolean;
  approved_by_human: boolean; steerable?: boolean; usd: number; updated_at: string; verdict_id: string | null; reasons: string[];
  changeset_id: string | null; head_sha: string | null; requires_second_factor: boolean; delivered?: string | null;
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
  /** D-367: why a person is asked ("needs_you") or that it went in by itself ("auto_applied", "applied") */
  notes: { kind: "needs_you" | "auto_applied" | "applied"; text: string }[];
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

/** D-367: Mandat's reasons to ask a person (task_activities "needs_you", comma-separated codes) → catalog keys. */
export type WhyKey = "why.not_verified" | "why.external" | "why.empty" | "why.deleted" | "why.renamed" | "why.too_big" | "why.too_many_files" | "why.night" | "why.apply_failed" | "why.other"
  | "why.sensitive.deps" | "why.sensitive.ci" | "why.sensitive.harness" | "why.sensitive.secrets" | "why.sensitive.hooks" | "why.sensitive.migrations";
const SIMPLE = new Set(["not_verified", "external", "empty", "night"]);
const SENS = new Set(["deps", "ci", "harness", "secrets", "hooks", "migrations"]);
export function whyOf(text: string): { key: WhyKey; path: string | null; n: number | null }[] {
  return text.split(", ").filter((x) => x.trim() !== "").map((code) => {
    const [head = "", ...rest] = code.split(":");
    const tail = rest.join(":");
    if (SIMPLE.has(head)) return { key: `why.${head}` as WhyKey, path: null, n: null };
    if (head === "deleted" || head === "renamed") return { key: `why.${head}` as WhyKey, path: tail, n: null };
    if (head === "too_big" || head === "too_many_files") return { key: `why.${head}` as WhyKey, path: null, n: Number(tail) };
    if (head === "apply_failed") return { key: "why.apply_failed", path: null, n: null };
    if (head === "sensitive" && SENS.has(rest[0] ?? "")) return { key: `why.sensitive.${rest[0]}` as WhyKey, path: rest.slice(1).join(":"), n: null };
    return { key: "why.other", path: null, n: null };
  });
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
