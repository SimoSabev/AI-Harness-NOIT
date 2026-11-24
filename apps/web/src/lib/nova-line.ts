import type { Key, Params } from "../i18n/t";
import { SCREEN_PATH } from "./voice-tools";
import type { VoiceScreen } from "@mandat/contract";

// D-599: what Nova's ribbon says, pure. The ribbon always names what she is doing now (never only "Thinking…"): a tool
// call is a verb and its target, her speech is a caption, the person's speech is their own words, and while she thinks
// it says about what. The browser side (components/voice-button.tsx) feeds the events; this keeps the state.
export type NovaPhase = "idle" | "connecting" | "listening" | "thinking" | "acting" | "speaking" | "error";
export interface NovaLine { key: Key; params?: Params }
export interface NovaStep extends NovaLine { at: number; done: boolean }
export interface NovaState { phase: NovaPhase; line: NovaLine | null; steps: NovaStep[]; lines: { who: "you" | "nova"; text: string }[] }
export type NovaEvent =
  | { type: "connecting" }
  | { type: "mode"; mode: "listening" | "speaking" }
  | { type: "heard"; text: string }
  | { type: "said"; text: string }
  | { type: "tool"; key: Key; params?: Params; at: number }
  | { type: "tool_done" }
  | { type: "error"; key: Key }
  | { type: "stop" };

export const NOVA_START: NovaState = { phase: "idle", line: null, steps: [], lines: [] };
const STEPS = 6;
const LINES = 4;
const MAX = 42;

/** a target short enough for one line */
export function clip(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > MAX ? `${one.slice(0, MAX).trimEnd()}…` : one;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** the line of one tool call; `label` names a control (v…) by what the person sees on it */
export function actionLine(name: string, params: unknown, label: (id: string) => string | null = () => null): NovaLine {
  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
  const key = `nova.act.${name}` as Key;
  const control = str(p.control);
  const target = name === "open_screen"
    ? (str(p.screen) ? SCREEN_PATH[p.screen as VoiceScreen] ?? String(p.screen) : null)
    : control
      ? label(control) ?? control
      : str(p.text) ?? str(p.question) ?? str(p.task_id) ?? str(p.research_id) ?? str(p.conversation_id) ?? str(p.project_id);
  return target ? { key, params: { target: clip(target) } } : { key };
}

const keep = <T,>(a: T[], n: number): T[] => a.slice(-n);

export function novaReducer(s: NovaState, e: NovaEvent): NovaState {
  switch (e.type) {
    case "connecting":
      return { ...NOVA_START, phase: "connecting", line: { key: "nova.line.connecting" } };
    case "mode":
      return e.mode === "speaking" ? { ...s, phase: "speaking" } : { ...s, phase: "listening", line: { key: "nova.line.listening" } };
    case "heard":
      return { ...s, phase: "thinking", line: { key: "nova.line.thinking", params: { target: clip(e.text) } }, lines: keep([...s.lines, { who: "you", text: e.text }], LINES) };
    case "said":
      return { ...s, phase: "speaking", line: { key: "nova.line.says", params: { target: clip(e.text) } }, lines: keep([...s.lines, { who: "nova", text: e.text }], LINES) };
    case "tool": {
      const step: NovaStep = { key: e.key, ...(e.params ? { params: e.params } : {}), at: e.at, done: false };
      return { ...s, phase: "acting", line: { key: e.key, ...(e.params ? { params: e.params } : {}) }, steps: keep([...s.steps, step], STEPS) };
    }
    case "tool_done":
      return { ...s, steps: s.steps.map((x, i) => (i === s.steps.length - 1 ? { ...x, done: true } : x)) };
    case "error":
      return { ...s, phase: "error", line: { key: e.key } };
    case "stop":
      return NOVA_START;
  }
}
