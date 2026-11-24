import { describe, expect, it } from "vitest";
import { Brief, CHAT_QUESTIONS_LIMIT, CHAT_TOOLS, ChatApproveBody, ChatMessageBody, ChatModelReply, ChatTurn, ConversationId, ConversationStatus, SessionPhase, briefText, capQuestions, limitResetsAt, specHash, specText, subscriptionLimitError } from "./index.js";
import type { Spec } from "./index.js";

// E10а ф. 1 (D-531): a conversation before work — the turns, the phase of the session and the three tools.
const spec: Spec = {
  goal: "Round discounts half up",
  product: "The cart rounds a discount that ends in .5 up.",
  criteria: [{ id: "AC-1", when: "a discount ends in .5", shall: "round it up", proof: "tests" }],
  unchanged: ["the cart total for whole numbers"],
  out_of_scope: ["currencies"],
  profile: "feature",
};
const brief = { goal: "Fix the discount rounding", touches: ["src/cart.ts"], avoid: ["the tests"], done_when: ["the cart test passes"] };

describe("conversation contract (D-531)", () => {
  it("the phase is conversation or work; the status names every stop", () => {
    expect(SessionPhase.options).toEqual(["conversation", "work"]);
    for (const s of ["idle", "queued", "running", "budget", "expired", "overloaded", "failed", "limit"]) expect(ConversationStatus.parse(s)).toBe(s);
    expect(() => SessionPhase.parse("sandbox")).toThrow();
  });
  it("live test 24.11: a subscription limit is its own stop and keeps when it resets (never the body of an answer)", () => {
    const e = subscriptionLimitError("2026-11-26T09:00:00.000Z");
    expect(e).toBe("subscription_limit resets 2026-11-26T09:00:00.000Z");
    expect(e.length).toBeLessThanOrEqual(300);
    expect(limitResetsAt(e)).toBe("2026-11-26T09:00:00.000Z");
    expect(subscriptionLimitError(null)).toBe("subscription_limit");
    expect(limitResetsAt("subscription_limit")).toBeNull();
    expect(limitResetsAt("the subscription CLI exited 1")).toBeNull();
    expect(limitResetsAt(null)).toBeNull();
  });
  it("the tools read, ask and propose; none of them writes, runs, reaches the network or approves (D-533)", () => {
    expect([...CHAT_TOOLS]).toEqual(["ask_user", "search_memory", "list_dir", "read_file", "grep", "propose_axes", "propose_spec", "propose_brief"]);
    for (const tool of ["write_file", "run_shell", "fetch", "start_task", "approve_spec", "exec"]) expect(ChatModelReply.safeParse({ say: "ok", call: { tool } }).success).toBe(false);
    expect(ChatModelReply.parse({ say: "", call: { tool: "read_file", path: "src/a.ts", from_line: 3 } }).call).toEqual({ tool: "read_file", path: "src/a.ts", from_line: 3 });
    expect(ChatModelReply.parse({ say: "", call: { tool: "grep", pattern: "round" } }).call).toEqual({ tool: "grep", pattern: "round" });
    expect(ChatModelReply.safeParse({ say: "", call: { tool: "read_file", path: "a", from_line: 0 } }).success).toBe(false);
  });
  it("ask_user takes as many questions as the work needs (D-533 supersedes the cut at 3); only a safety limit stays", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => `q${i + 1}?`);
    expect(ChatModelReply.parse({ say: "", call: { tool: "ask_user", questions: twelve } }).call).toEqual({ tool: "ask_user", questions: twelve });
    expect(CHAT_QUESTIONS_LIMIT).toBeGreaterThanOrEqual(50);
    const many = Array.from({ length: CHAT_QUESTIONS_LIMIT + 5 }, (_, i) => `q${i}?`);
    expect(capQuestions({ say: "", call: { tool: "ask_user", questions: [...many, 5] } })).toEqual({ say: "", call: { tool: "ask_user", questions: many.slice(0, CHAT_QUESTIONS_LIMIT) } });
    expect(capQuestions("text")).toBe("text");
    expect(ChatTurn.safeParse({ seq: 1, at: "2026-11-17T10:00:00.000Z", kind: "assistant", text: "?", questions: twelve, brief: null, model: "m", usd: 0 }).success).toBe(true);
  });
  it("an answer the server could not read is marked unreadable, with no text (the live test of 17.11.2026)", () => {
    const at = "2026-11-17T10:00:00.000Z";
    expect(ChatTurn.parse({ seq: 1, at, kind: "assistant", text: "", questions: [], brief: null, model: "m", usd: 0, unreadable: true })).toMatchObject({ unreadable: true });
    expect(ChatTurn.safeParse({ seq: 1, at, kind: "assistant", text: "", questions: [], brief: null, model: "m", usd: 0, unreadable: false }).success).toBe(false);
  });
  it("the turns of a tool, the axes and the spec carry no file contents", () => {
    const at = "2026-11-17T10:00:00.000Z";
    expect(ChatTurn.parse({ seq: 3, at, kind: "tool", tool: "read_file", target: "src/a.ts", ok: true, note: "12 lines" }).kind).toBe("tool");
    expect(ChatTurn.safeParse({ seq: 3, at, kind: "tool", tool: "read_file", target: "src/a.ts", ok: true, note: "x", content: "secret" }).success).toBe(false);
    const axes = { code: "existing", reference: "none", divisible: "no", proof: ["tests"], risk: { level: "low", outward: false }, size: "unknown" };
    expect(ChatTurn.parse({ seq: 4, at, kind: "axes", axes, hint: null, profile: "feature", unknown: ["size"] }).kind).toBe("axes");
    expect(ChatTurn.parse({ seq: 5, at, kind: "spec", spec, hash: specHash(spec), ready: false, unknown: [], untestable: ["AC-1"] }).kind).toBe("spec");
  });
  it("the spec as the text of a task: goal, criteria as WHEN … SHALL, unchanged, out of scope; within the task's 4000 chars", () => {
    const t = specText(spec);
    expect(t).toContain("Goal: Round discounts half up");
    expect(t).toContain("AC-1: WHEN a discount ends in .5 THE SYSTEM SHALL round it up (proof: tests)");
    expect(t).toContain("Unchanged: the cart total for whole numbers");
    expect(t).toContain("Out of scope: currencies");
    expect(specText({ ...spec, product: "x".repeat(40_000) }).length).toBeLessThanOrEqual(4000);
    expect(ChatApproveBody.parse({ spec_hash: specHash(spec) })).toEqual({ spec_hash: specHash(spec) });
    expect(ChatApproveBody.safeParse({ spec_hash: "abc" }).success).toBe(false);
  });
  it("a brief has a goal, the touched parts, what not to touch and how we know it is done", () => {
    expect(Brief.parse(brief)).toEqual(brief);
    expect(() => Brief.parse({ ...brief, done_when: [] })).toThrow();
    expect(() => Brief.parse({ ...brief, allow_paths: ["**"] })).toThrow();
    expect(briefText(brief)).toBe("Goal: Fix the discount rounding\nTouches: src/cart.ts\nDo not touch: the tests\nDone when: the cart test passes");
  });
  it("a turn is human, assistant, memory, tool, axes or spec; a reply without a call is plain text", () => {
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
