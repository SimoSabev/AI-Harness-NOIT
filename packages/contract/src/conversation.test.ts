import { describe, expect, it } from "vitest";
import { Brief, CHAT_MAX_QUESTIONS, CHAT_TOOLS, ChatMessageBody, ChatModelReply, ChatTurn, ConversationId, ConversationStatus, SessionPhase, briefText, capQuestions } from "./index.js";

// E10а ф. 1 (D-531): a conversation before work — the turns, the phase of the session and the three tools.
const brief = { goal: "Fix the discount rounding", touches: ["src/cart.ts"], avoid: ["the tests"], done_when: ["the cart test passes"] };

describe("conversation contract (D-531)", () => {
  it("the phase is conversation or work; the status names every stop", () => {
    expect(SessionPhase.options).toEqual(["conversation", "work"]);
    for (const s of ["idle", "queued", "running", "budget", "expired", "overloaded", "failed"]) expect(ConversationStatus.parse(s)).toBe(s);
    expect(() => SessionPhase.parse("sandbox")).toThrow();
  });
  it("exactly three tools, none of them writes, runs or reaches the network", () => {
    expect([...CHAT_TOOLS]).toEqual(["ask_user", "search_memory", "propose_brief"]);
    for (const tool of ["write_file", "run_shell", "fetch", "start_task"]) expect(ChatModelReply.safeParse({ say: "ok", call: { tool } }).success).toBe(false);
  });
  it("ask_user asks at most 3 questions; capQuestions cuts a longer list", () => {
    expect(CHAT_MAX_QUESTIONS).toBe(3);
    expect(ChatModelReply.safeParse({ say: "", call: { tool: "ask_user", questions: ["a?", "b?", "c?", "d?"] } }).success).toBe(false);
    expect(capQuestions({ say: "", call: { tool: "ask_user", questions: ["a?", "b?", "c?", "d?", 5] } })).toEqual({ say: "", call: { tool: "ask_user", questions: ["a?", "b?", "c?"] } });
    expect(capQuestions("text")).toBe("text");
    expect(ChatTurn.safeParse({ seq: 1, at: "2026-11-17T10:00:00.000Z", kind: "assistant", text: "?", questions: ["a", "b", "c", "d"], brief: null, model: "m", usd: 0 }).success).toBe(false);
  });
  it("a brief has a goal, the touched parts, what not to touch and how we know it is done", () => {
    expect(Brief.parse(brief)).toEqual(brief);
    expect(() => Brief.parse({ ...brief, done_when: [] })).toThrow();
    expect(() => Brief.parse({ ...brief, allow_paths: ["**"] })).toThrow();
    expect(briefText(brief)).toBe("Goal: Fix the discount rounding\nTouches: src/cart.ts\nDo not touch: the tests\nDone when: the cart test passes");
  });
  it("a turn is human, assistant or memory; a reply without a call is plain text", () => {
    expect(ChatTurn.parse({ seq: 0, at: "2026-11-17T10:00:00.000Z", kind: "human", text: "hi" }).kind).toBe("human");
    expect(ChatTurn.parse({ seq: 2, at: "2026-11-17T10:00:00.000Z", kind: "memory", query: "rounding", hits: [{ id: "00000000-0000-4000-8000-000000000001", text: "we round half up" }] }).kind).toBe("memory");
    expect(ChatModelReply.parse({ say: "Hello" })).toEqual({ say: "Hello", call: null });
    expect(ChatModelReply.parse({ say: "", call: { tool: "propose_brief", brief } }).call).toMatchObject({ tool: "propose_brief" });
  });
  it("a message from the web: a known agent, a short text, an optional conversation", () => {
    expect(ConversationId.parse("c_abc123")).toBe("c_abc123");
    expect(() => ConversationId.parse("../x")).toThrow();
    expect(ChatMessageBody.parse({ text: "hi", agent: "claude@personal", model: "claude-sonnet-5-5" }).agent).toBe("claude@personal");
    expect(ChatMessageBody.safeParse({ text: "", agent: "claude" }).success).toBe(false);
    expect(ChatMessageBody.safeParse({ text: "hi", agent: "rm -rf" }).success).toBe(false);
    expect(ChatMessageBody.safeParse({ text: "hi", agent: "claude", extra: true }).success).toBe(false);
  });
});
