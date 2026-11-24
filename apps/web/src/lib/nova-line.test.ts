import { VOICE_TOOLS } from "@mandat/contract";
import { describe, expect, it } from "vitest";
import { en } from "../i18n/en";
import { actionLine, clip, novaReducer, NOVA_START } from "./nova-line";
import type { NovaState } from "./nova-line";

// D-599: Nova's ribbon always says what she is doing now — never only "Thinking…". Every tool has a verb and its target;
// while she speaks the ribbon is the caption of her sentence, while the person speaks it is their words, while she
// thinks it says about what.
describe("actionLine (D-599)", () => {
  it("every voice tool has its own line in the catalog", () => {
    for (const tool of VOICE_TOOLS) {
      const line = actionLine(tool.name, {});
      expect(line.key in en, tool.name).toBe(true);
    }
  });
  it("names the target: the screen, the control, the text being written", () => {
    expect(actionLine("open_screen", { screen: "projects" })).toEqual({ key: "nova.act.open_screen", params: { target: "/harness" } });
    expect(actionLine("press", { control: "v3" }, (id) => (id === "v3" ? "Прати" : null))).toEqual({ key: "nova.act.press", params: { target: "Прати" } });
    const long = "Добави програма за лоялност: точки при всяко плащане и подаръчни карти";
    expect(actionLine("write_prompt", { text: long }).params?.target).toBe(`${long.slice(0, 42).trimEnd()}…`);
  });
  it("a control without a label is still named by something", () => {
    expect(actionLine("press", { control: "v9" }, () => null).params?.target).toBe("v9");
  });
  it("clip keeps short text and cuts long text at a word-agnostic length with an ellipsis", () => {
    expect(clip("кратко")).toBe("кратко");
    expect(clip("a".repeat(60))).toHaveLength(43);
  });
});

describe("novaReducer (D-599)", () => {
  const run = (...events: Parameters<typeof novaReducer>[1][]): NovaState => events.reduce(novaReducer, NOVA_START);
  it("connecting, then listening, with the person's words as they come", () => {
    const s = run({ type: "connecting" }, { type: "mode", mode: "listening" }, { type: "heard", text: "пусни задачата за лоялността" });
    expect(s.phase).toBe("thinking");
    expect(s.line).toEqual({ key: "nova.line.thinking", params: { target: "пусни задачата за лоялността" } });
  });
  it("a tool call is an action step; its end marks it done", () => {
    const s = run({ type: "connecting" }, { type: "tool", key: "nova.act.open_screen", params: { target: "/harness" }, at: 1 });
    expect(s.phase).toBe("acting");
    expect(s.steps).toEqual([{ key: "nova.act.open_screen", params: { target: "/harness" }, at: 1, done: false }]);
    const t = novaReducer(s, { type: "tool_done" });
    expect(t.steps[0]?.done).toBe(true);
  });
  it("while she speaks, the ribbon is her caption", () => {
    const s = run({ type: "connecting" }, { type: "mode", mode: "speaking" }, { type: "said", text: "Пуснах я. u1 започна." });
    expect(s.phase).toBe("speaking");
    expect(s.line).toEqual({ key: "nova.line.says", params: { target: "Пуснах я. u1 започна." } });
  });
  it("keeps the last 6 steps and the last 4 lines of the conversation", () => {
    let s = run({ type: "connecting" });
    for (let i = 0; i < 9; i++) s = novaReducer(s, { type: "tool", key: "nova.act.list_controls", at: i });
    for (let i = 0; i < 7; i++) s = novaReducer(s, { type: "said", text: `ред ${i}` });
    expect(s.steps).toHaveLength(6);
    expect(s.lines).toHaveLength(4);
  });
  it("an error says why; stopping returns to rest", () => {
    expect(run({ type: "error", key: "voice.err.mic" }).phase).toBe("error");
    expect(run({ type: "connecting" }, { type: "stop" })).toEqual(NOVA_START);
  });
});
