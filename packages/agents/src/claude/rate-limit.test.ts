import { describe, expect, it } from "vitest";
import { subscriptionLimit } from "./rate-limit.js";

// D-567 (live test 21.11): a subscription's limit comes only in the agent's own stream; the harness reads it as a limit
// (wait until it resets), never as an empty change or a failed agent.
describe("subscriptionLimit (D-567)", () => {
  it("a rejected rate_limit_event → a limit that resets at its time; allowed or other events → none", () => {
    const at = "2026-11-21T09:00:00.000Z";
    expect(subscriptionLimit({ type: "rate_limit_event", rate_limit_info: { status: "rejected", resetsAt: 1795264200, rateLimitType: "five_hour" } }, at)).toEqual({ retry_after_s: null, resets_at: new Date(1795264200 * 1000).toISOString(), at });
    expect(subscriptionLimit({ type: "rate_limit_event", rate_limit_info: { status: "allowed", resetsAt: 1795264200 } }, at)).toBeNull();
    expect(subscriptionLimit({ type: "rate_limit_event", rate_limit_info: { status: "rejected" } }, at)).toEqual({ retry_after_s: null, resets_at: null, at });
    expect(subscriptionLimit({ type: "assistant" }, at)).toBeNull();
    expect(subscriptionLimit("nope", at)).toBeNull();
  });
});
