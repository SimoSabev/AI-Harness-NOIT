import { describe, expect, it } from "vitest";
import { ChannelRule } from "@mandat/contract";
import { selectChannel, selectChannelForRole } from "./select.js";
import { ch } from "./select.test-helper.js";

const now = new Date("2026-10-28T12:00:00Z");
const rule = (r: unknown) => ChannelRule.parse(r);

// E9в (spec 5.3, D-420): each role goes to its own channel; a local channel is a candidate (price 0, no day budget)
describe("selectChannel by role (D-420)", () => {
  const all = [ch({ id: "opus", quality: 1, cost: 1 }), ch({ id: "haiku", quality: 0.6, cost: 0.1 }), ch({ id: "ollama", kind: "local", quality: 0.5, cost: 0, budget_usd_day: null })];
  const rules = [rule({ mode: "fixed", channel_id: "opus", fallback_ids: ["haiku"] }), rule({ mode: "fixed", channel_id: "haiku", fallback_ids: [], role: "summary" }), rule({ mode: "fixed", channel_id: "ollama", fallback_ids: [], role: "review" })];
  it("the role's own rule decides; the reason names the role", () => {
    const s = selectChannelForRole(all, rules, "summary", { estCostUsd: 0.1, now });
    expect(s.ok && [s.channel.id, s.reason.rule, s.reason.role]).toEqual(["haiku", "fixed", "summary"]);
    const r = selectChannelForRole(all, rules, "review", { estCostUsd: 0.1, now });
    expect(r.ok && [r.channel.id, r.reason.role]).toEqual(["ollama", "review"]);
  });
  it("a role without a rule follows the lead rule", () => {
    const s = selectChannelForRole(all, rules, "subagent", { estCostUsd: 0.1, now });
    expect(s.ok && [s.channel.id, s.reason.role]).toEqual(["opus", "subagent"]);
  });
  it("no rules → auto over every channel (the local one included)", () => {
    const s = selectChannelForRole([ch({ id: "ollama", kind: "local", quality: 0.9, cost: 0, budget_usd_day: null })], [], "lead", { estCostUsd: 5, now });
    expect(s.ok && [s.channel.id, s.reason.rule]).toEqual(["ollama", "auto"]);
  });
  it("a local channel ignores the day budget; cli_profile stays out of the scored pool", () => {
    const r = selectChannel([ch({ id: "l", kind: "local", budget_usd_day: 0.01, spent_today_usd: 1 }), ch({ id: "p", kind: "cli_profile" })], { estCostUsd: 1, rule: { mode: "auto", channel_id: null, fallback_ids: [] }, now });
    expect(r.ok && r.channel.id).toBe("l");
  });
});
