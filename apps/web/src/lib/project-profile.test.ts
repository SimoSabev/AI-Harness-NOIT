import { describe, expect, it } from "vitest";
import { profileOf } from "./project-profile";
import type { ChatTurn } from "@mandat/contract";

// D-599: the brief of a project, written live while the interview asks — each part from the latest note (or the
// proposed brief), with where it came from; the parts the latest note wrote are "fresh" (they land on screen).
const at = "2026-11-24T10:00:00.000Z";
const note = (seq: number, from: "code" | "person", parts: Record<string, unknown>) => ({ seq, at, kind: "project_note", from, parts }) as ChatTurn;

describe("profileOf (D-599)", () => {
  it("eight parts, all empty before anything is noted", () => {
    const p = profileOf([]);
    expect(p.tiles.map((x) => x.part)).toEqual(["product", "stack", "commands", "users", "works_today", "must_not_break", "approver", "budget_usd"]);
    expect(p.tiles.every((x) => x.value === null)).toBe(true);
    expect(p.filled).toBe(0);
  });
  it("each note fills its parts with where they came from; the latest note's parts are fresh", () => {
    const p = profileOf([note(1, "code", { stack: ["TypeScript", "Next.js"], commands: { test: "pnpm test", dev: "pnpm dev" } }), note(3, "person", { users: ["customers", "staff"] })]);
    const by = Object.fromEntries(p.tiles.map((x) => [x.part, x]));
    expect(by.stack).toMatchObject({ value: "TypeScript · Next.js", from: "code", fresh: false });
    expect(by.commands).toMatchObject({ value: "test: pnpm test\ndev: pnpm dev", from: "code" });
    expect(by.users).toMatchObject({ value: "customers · staff", from: "person", fresh: true });
    expect(p.filled).toBe(3);
  });
  it("a later note replaces a part; the proposed brief fills what no note wrote", () => {
    const brief = { product: "A bakery shop", users: ["customers"], works_today: ["checkout"], must_not_break: ["payments"], commands: { test: "pnpm test" }, stack: ["TS"], approver: "Simo", budget_usd: 5, notes: [] };
    const p = profileOf([note(1, "person", { approver: "Ivan" }), note(2, "person", { approver: "Simo" }), { seq: 4, at, kind: "project", brief, hash: `sha256:${"a".repeat(64)}`, ready: true, missing: [] } as ChatTurn]);
    const by = Object.fromEntries(p.tiles.map((x) => [x.part, x]));
    expect(by.approver).toMatchObject({ value: "Simo", from: "person" });
    expect(by.budget_usd).toMatchObject({ value: "5 USD", from: null });
    expect(p.filled).toBe(8);
  });
});
