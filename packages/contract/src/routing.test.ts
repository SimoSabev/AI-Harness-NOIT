import { describe, expect, it } from "vitest";
import { ModelRole, ChannelRule, ruleForRole } from "./index.js";

// E9в (spec 5.3, D-420): routing_rules carry a role; each role can go to its own channel
describe("routing roles (D-420)", () => {
  it("the five roles; lead is the default", () => {
    expect(ModelRole.options).toEqual(["lead", "subagent", "research", "review", "summary"]);
    expect(ChannelRule.parse({ mode: "auto", channel_id: null, fallback_ids: [] }).role).toBe("lead");
  });
  it("fixed needs a channel; unknown role and extra keys are refused", () => {
    expect(ChannelRule.safeParse({ mode: "fixed", channel_id: null, fallback_ids: [], role: "review" }).success).toBe(false);
    expect(ChannelRule.safeParse({ mode: "auto", channel_id: null, fallback_ids: [], role: "boss" }).success).toBe(false);
    expect(ChannelRule.safeParse({ mode: "auto", channel_id: null, fallback_ids: [], role: "lead", x: 1 }).success).toBe(false);
  });
  it("ruleForRole: the role's rule, else the lead rule, else auto", () => {
    const lead = ChannelRule.parse({ mode: "fixed", channel_id: "a", fallback_ids: ["b"] });
    const review = ChannelRule.parse({ mode: "fixed", channel_id: "r", fallback_ids: [], role: "review" });
    expect(ruleForRole([lead, review], "review")).toBe(review);
    expect(ruleForRole([lead, review], "summary")).toBe(lead);
    expect(ruleForRole([review], "lead")).toEqual({ mode: "auto", channel_id: null, fallback_ids: [], role: "lead" });
  });
});
