import { describe, expect, it } from "vitest";
import { JARVIS_PROMPT_BG, VOICE_TOOLS, VoiceProviderId, VoiceToolCall, voiceToolNames } from "./voice.js";

// D-556 (Simo 20.11.2026): Jarvis — a voice that listens, speaks Bulgarian and acts through the same actions as the
// screens. The tools are one list in the contract; every voice engine gets the same list.
describe("the voice's tools (D-556)", () => {
  it("has the actions Simo asked for: screens, what waits, projects, tasks, conversations, steering a running agent", () => {
    expect(voiceToolNames()).toEqual([
      "open_screen", "whats_waiting", "list_projects", "task_status", "start_conversation", "start_project_interview", "send_message", "start_work", "steer_agent", "describe_screen",
      "list_controls", "write_prompt", "type_text", "press", "choose",
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
});

