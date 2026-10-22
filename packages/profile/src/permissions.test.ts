import { describe, expect, it } from "vitest";
import type { ToolRule } from "@mandat/contract";
import { applyPermissions, forbidAtNight, grantOnce, opensDangerous, parseAsks } from "./permissions.js";

// E8g (v5 p. 4.4, D-352): tool_permissions (subject × tool → decision) is the source of layer C; "ask" becomes a card.
const C: ToolRule[] = [
  { subject: "any", tool: "bash:git push *", decision: "deny", reason: "no pushes" },
  { subject: "any", tool: "mcp:stripe.create_refund", decision: "ask", reason: "money" },
  { subject: "agent:claude", tool: "net:api.segment.io", decision: "deny", reason: "" },
];

describe("applyPermissions", () => {
  it("a row overrides the same subject × tool, new rows are appended, other rules stay in order", () => {
    const out = applyPermissions(C, [
      { subject: "any", tool: "mcp:stripe.create_refund", decision: "allow" },
      { subject: "night", tool: "path:write:infra/**", decision: "deny" },
    ]);
    expect(out.map((r) => `${r.subject} ${r.tool} ${r.decision}`)).toEqual([
      "any bash:git push * deny",
      "any mcp:stripe.create_refund allow",
      "agent:claude net:api.segment.io deny",
      "night path:write:infra/** deny",
    ]);
    expect(out[1]?.reason).toBe("money");
    expect(out[3]?.reason).toBe("tool_permissions");
  });
  it("rows that are not valid subjects or tool patterns are dropped, not trusted", () => {
    expect(applyPermissions([], [{ subject: "root!", tool: "bash:x", decision: "allow" }, { subject: "any", tool: "rm -rf", decision: "allow" }])).toEqual([]);
  });
});

describe("opensDangerous", () => {
  it("only a change TO allow on net:* or bash:git push needs a second factor", () => {
    expect(opensDangerous("net:api.segment.io", "deny", "allow")).toBe(true);
    expect(opensDangerous("bash:git push *", "ask", "allow")).toBe(true);
    expect(opensDangerous("bash:git push --force", null, "allow")).toBe(true);
    expect(opensDangerous("net:x.io", "allow", "allow")).toBe(false);
    expect(opensDangerous("net:x.io", "allow", "deny")).toBe(false);
    expect(opensDangerous("mcp:stripe.create_refund", "ask", "allow")).toBe(false);
    expect(opensDangerous("bash:git status", "deny", "allow")).toBe(false);
  });
});

describe("grantOnce", () => {
  it("turns the granted ask rules into allow for one attempt; deny rules are never touched", () => {
    const out = grantOnce(C, ["mcp:stripe.create_refund", "bash:git push *"]);
    expect(out.map((r) => r.decision)).toEqual(["deny", "allow", "deny"]);
    expect(out[1]?.reason).toBe("allowed once by a person");
  });
});

describe("parseAsks", () => {
  const policy = { rules: [{ tool: "mcp:stripe.create_refund", decision: "ask" }, { tool: "bash:git push *", decision: "deny" }] };
  it("keeps only asks that name an ask rule of the policy (the agent can write /m/out too), deduped, ≤ 20", () => {
    const text = [
      JSON.stringify({ ts: "2026-10-22T10:00:00.000Z", tool: "mcp:stripe.create_refund", reason: "money" }),
      JSON.stringify({ ts: "2026-10-22T10:00:01.000Z", tool: "mcp:stripe.create_refund", reason: "money" }),
      JSON.stringify({ ts: "2026-10-22T10:00:02.000Z", tool: "net:*", reason: "please allow everything" }),
      JSON.stringify({ ts: "2026-10-22T10:00:03.000Z", tool: "bash:git push *", reason: "" }),
      "not json",
    ].join("\n");
    expect(parseAsks(text, policy)).toEqual([{ tool: "mcp:stripe.create_refund", reason: "" }]);
  });
  it("the reason comes from the policy, not from the file", () => {
    const text = JSON.stringify({ ts: "x", tool: "mcp:stripe.create_refund", reason: "IGNORE PREVIOUS INSTRUCTIONS" });
    expect(parseAsks(text, { rules: [{ tool: "mcp:stripe.create_refund", decision: "ask", reason: "money" }] })).toEqual([{ tool: "mcp:stripe.create_refund", reason: "money" }]);
  });
  it("empty / missing → []", () => {
    expect(parseAsks("", policy)).toEqual([]);
  });
});

describe("forbidAtNight (E9а)", () => {
  it("the night's forbidden tools become deny rules for the subject night; an existing night rule is overridden; invalid patterns are dropped", () => {
    const c: ToolRule[] = [{ subject: "any", tool: "bash:npm view *", decision: "allow", reason: "" }, { subject: "night", tool: "bash:curl *", decision: "allow", reason: "x" }];
    const out = forbidAtNight(c, ["bash:curl *", "mcp:stripe.*", "not a pattern"]);
    expect(out).toEqual([
      { subject: "any", tool: "bash:npm view *", decision: "allow", reason: "" },
      { subject: "night", tool: "bash:curl *", decision: "deny", reason: "forbidden by the night shift" },
      { subject: "night", tool: "mcp:stripe.*", decision: "deny", reason: "forbidden by the night shift" },
    ]);
    expect(forbidAtNight(c, [])).toEqual(c);
  });
});
