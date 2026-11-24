import { describe, expect, it } from "vitest";
import { ChatMessageBody, ChatToolCall, ChatTurn, PROJECT_BRIEF_TEXT_MAX, ProjectApproveBody, ProjectBrief, projectBriefHash, projectBriefMissing, projectBriefText } from "./index.js";

// D-557: the interview of a whole project when it is added. The model reads the project and asks, then proposes a
// project brief; a person approves it; later task conversations start from it.
const brief = {
  product: "An online shop for a local bakery",
  users: ["customers", "the bakery's staff"],
  works_today: ["checkout with a card", "the 10% discount over 50 EUR"],
  must_not_break: ["no discount at exactly 50 EUR"],
  commands: { install: "pnpm install", test: "pnpm test" },
  stack: ["TypeScript", "Vitest"],
  approver: "Simo",
  budget_usd: 5,
  notes: [],
};

describe("the project brief (D-557)", () => {
  it("is strict, bounded and hashed; its text fits a conversation's context", () => {
    expect(ProjectBrief.safeParse(brief).success).toBe(true);
    expect(ProjectBrief.safeParse({ ...brief, extra: 1 }).success).toBe(false);
    expect(ProjectBrief.safeParse({ ...brief, budget_usd: -1 }).success).toBe(false);
    expect(ProjectBrief.safeParse({ ...brief, commands: { test: "x".repeat(300) } }).success).toBe(false);
    const b = ProjectBrief.parse(brief);
    expect(projectBriefHash(b)).toMatch(/^sha256:[0-9a-f]{64}$/);
    const t = projectBriefText(b);
    expect(t).toContain("Product: An online shop for a local bakery");
    expect(t).toContain("Must not break: no discount at exactly 50 EUR");
    expect(t).toContain("Tests: pnpm test");
    const big = ProjectBrief.parse({ ...brief, product: "p".repeat(2000), works_today: Array.from({ length: 30 }, () => "w".repeat(300)) });
    expect(projectBriefText(big).length).toBeLessThanOrEqual(PROJECT_BRIEF_TEXT_MAX);
  });
  it("lacks users, what works today or a test command before a person may approve it", () => {
    expect(projectBriefMissing(ProjectBrief.parse(brief))).toEqual([]);
    expect(projectBriefMissing(ProjectBrief.parse({ ...brief, users: [], works_today: [], commands: {} }))).toEqual(["users", "works_today", "commands.test"]);
  });
  it("the model proposes it with a tool; the turn keeps it with its hash; a message may open a project interview", () => {
    expect(ChatToolCall.safeParse({ tool: "propose_project", brief: {} }).success).toBe(true);
    const b = ProjectBrief.parse(brief);
    expect(ChatTurn.safeParse({ seq: 3, at: "2026-11-20T10:00:00.000Z", kind: "project", brief: b, hash: projectBriefHash(b), ready: true, missing: [] }).success).toBe(true);
    expect(ChatMessageBody.safeParse({ text: "Get to know the project", agent: "claude", repo: "00000000-0000-4000-8000-000000000001", purpose: "project" }).success).toBe(true);
    expect(ChatMessageBody.safeParse({ text: "x", agent: "claude", purpose: "other" }).success).toBe(false);
    expect(ProjectApproveBody.safeParse({ brief_hash: `sha256:${"a".repeat(64)}` }).success).toBe(true);
  });
});

// D-599 (Simo 24.11.2026): the brief is written live while the interview asks. With any answer the model may note the
// parts it just learned and where from (the code or the person); the screen fills the brief from these notes.
describe("project notes (D-599)", () => {
  it("a note carries some parts of the brief and where they came from; nothing else", async () => {
    const { ProjectNote } = await import("./index.js");
    expect(ProjectNote.safeParse({ from: "code", parts: { stack: ["TypeScript"], commands: { test: "pnpm test" } } }).success).toBe(true);
    expect(ProjectNote.safeParse({ from: "person", parts: { users: ["customers"] } }).success).toBe(true);
    expect(ProjectNote.safeParse({ from: "person", parts: {} }).success).toBe(false);
    expect(ProjectNote.safeParse({ from: "guess", parts: { users: ["x"] } }).success).toBe(false);
    expect(ProjectNote.safeParse({ from: "code", parts: { secrets: "x" } }).success).toBe(false);
    expect(ProjectNote.safeParse({ from: "code", parts: { budget_usd: -1 } }).success).toBe(false);
  });
  it("the model's reply may carry a note next to its call; the turn keeps it", async () => {
    const { ChatModelReply: Reply } = await import("./index.js");
    expect(Reply.safeParse({ say: "ok", call: { tool: "ask_user", questions: ["Кой ползва магазина?"] }, note: { from: "code", parts: { product: "a bakery shop" } } }).success).toBe(true);
    expect(ChatTurn.safeParse({ seq: 3, at: "2026-11-24T10:00:00.000Z", kind: "project_note", from: "person", parts: { users: ["customers"] } }).success).toBe(true);
  });
});
