import { describe, expect, it } from "vitest";
import { JARVIS_FIRST_MESSAGE_BG, JARVIS_PROMPT_BG, VOICE_TOOLS, VoiceProviderId, VoiceToolCall, voiceToolNames } from "./voice.js";

// D-556 (Simo 20.11.2026): Jarvis — a voice that listens, speaks Bulgarian and acts through the same actions as the
// screens. The tools are one list in the contract; every voice engine gets the same list.
describe("the voice's tools (D-556)", () => {
  it("has the actions Simo asked for: screens, what waits, projects, tasks, conversations, steering a running agent", () => {
    expect(voiceToolNames()).toEqual([
      "open_screen", "whats_waiting", "list_projects", "task_status", "start_conversation", "start_project_interview", "send_message", "start_work", "steer_agent", "describe_screen",
      "list_controls", "write_prompt", "type_text", "press", "choose",
      "start_research", "research_result", "stop_research", "list_models", "set_defaults",
    ]);
  });

  it("never approves, merges or signs: those stay with the person and the second factor", () => {
    for (const t of VOICE_TOOLS) expect(`${t.name} ${t.description}`).not.toMatch(/approve|merge|totp|одобр(и|ява)\b/i);
  });

  it("every tool has a Bulgarian description and typed parameters", () => {
    for (const t of VOICE_TOOLS) {
      expect(t.description.length).toBeGreaterThan(20);
      for (const p of t.params) expect(["string", "number", "boolean"]).toContain(p.type);
    }
  });

  it("parses a call by its tool's own arguments; unknown tools and bad arguments are refused", () => {
    expect(VoiceToolCall.parse({ tool: "open_screen", args: { screen: "projects" } })).toEqual({ tool: "open_screen", args: { screen: "projects" } });
    expect(VoiceToolCall.safeParse({ tool: "open_screen", args: { screen: "/etc/passwd" } }).success).toBe(false);
    expect(VoiceToolCall.safeParse({ tool: "approve_change", args: {} }).success).toBe(false);
    expect(VoiceToolCall.safeParse({ tool: "start_conversation", args: { text: "" } }).success).toBe(false);
    expect(VoiceToolCall.safeParse({ tool: "steer_agent", args: { task_id: "t_abc", text: "ползвай zod" } }).success).toBe(true);
    expect(VoiceToolCall.safeParse({ tool: "steer_agent", args: { task_id: "../x", text: "a" } }).success).toBe(false);
  });

  it("knows the engines: ElevenLabs first, OpenAI Realtime and the browser's own voice as fallbacks", () => {
    expect(VoiceProviderId.options).toEqual(["elevenlabs", "openai_realtime", "browser"]);
  });

  it("D-582: the screen itself — controls by the id list_controls gave, text as said; nothing else gets through", () => {
    expect(VoiceToolCall.safeParse({ tool: "list_controls", args: {} }).success).toBe(true);
    expect(VoiceToolCall.safeParse({ tool: "write_prompt", args: { text: "Добави лоялност" } }).success).toBe(true);
    expect(VoiceToolCall.safeParse({ tool: "write_prompt", args: { text: "" } }).success).toBe(false);
    expect(VoiceToolCall.safeParse({ tool: "type_text", args: { control: "v12", text: "5", mode: "append" } }).success).toBe(true);
    expect(VoiceToolCall.safeParse({ tool: "type_text", args: { control: "v12", text: "5", mode: "erase_all" } }).success).toBe(false);
    expect(VoiceToolCall.safeParse({ tool: "press", args: { control: "v3" } }).success).toBe(true);
    expect(VoiceToolCall.safeParse({ tool: "press", args: { control: "#approve" } }).success).toBe(false);
    expect(VoiceToolCall.safeParse({ tool: "press", args: { control: "v3", force: true } }).success).toBe(false);
    expect(VoiceToolCall.safeParse({ tool: "choose", args: { control: "v4", option: "claude-sonnet-5-5" } }).success).toBe(true);
  });

  it("D-582: the prompt says what stays with the person, whatever the screen shows", () => {
    expect(JARVIS_PROMPT_BG).toMatch(/write_prompt/);
    expect(JARVIS_PROMPT_BG).toMatch(/прати/);
    expect(JARVIS_PROMPT_BG).toMatch(/Никога не одобряваш, не сливаш и не подписваш/);
    expect(JARVIS_PROMPT_BG).toMatch(/ключове/);
  });

  it("D-584: research, models and defaults by their own tools; arguments typed", () => {
    expect(VoiceToolCall.safeParse({ tool: "start_research", args: { question: "Кои български университети са най-силни в софтуерното инженерство?", depth: "standard" } }).success).toBe(true);
    expect(VoiceToolCall.safeParse({ tool: "start_research", args: { question: "x", depth: "infinite" } }).success).toBe(false);
    expect(VoiceToolCall.safeParse({ tool: "research_result", args: { research_id: "q_mx1abc" } }).success).toBe(true);
    expect(VoiceToolCall.safeParse({ tool: "research_result", args: { research_id: "../q" } }).success).toBe(false);
    expect(VoiceToolCall.safeParse({ tool: "set_defaults", args: { model: "claude-opus-5-5", task_mode: "work_now" } }).success).toBe(true);
    expect(VoiceToolCall.safeParse({ tool: "set_defaults", args: {} }).success).toBe(false);
    expect(VoiceToolCall.safeParse({ tool: "set_defaults", args: { task_mode: "yolo" } }).success).toBe(false);
  });

  it("D-584: like a real assistant — short, stops when cut off, says only what a tool confirmed; research is research, not a code task", () => {
    expect(JARVIS_PROMPT_BG).toMatch(/кратк/i);
    expect(JARVIS_PROMPT_BG).toMatch(/прекъсне/);
    expect(JARVIS_PROMPT_BG).toMatch(/start_research/);
    expect(JARVIS_PROMPT_BG).toMatch(/само каквото инструментът/);
    expect(JARVIS_PROMPT_BG).toMatch(/критерии/);
    expect(JARVIS_FIRST_MESSAGE_BG.length).toBeLessThan(40);
  });

  it("D-585: interviews before a task or research — one short question at a time — and skips it only on „направо“; writes into the screen's form", () => {
    expect(JARVIS_PROMPT_BG).toMatch(/интервю/i);
    expect(JARVIS_PROMPT_BG).toMatch(/по един кратък въпрос/);
    expect(JARVIS_PROMPT_BG).toMatch(/направо/);
    expect(JARVIS_PROMPT_BG).toMatch(/open_screen research/);
  });

  it("D-586: knows it can write in every field of every screen and tab", () => {
    expect(JARVIS_PROMPT_BG).toMatch(/всяко поле на всеки екран/);
  });
});

