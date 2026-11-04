import { describe, expect, it } from "vitest";
import { MandatError, SUBSCRIPTIONS, SubscriptionId, canSignIn, isKeyCli } from "@mandat/contract";
import { subscriptionAdapter } from "./index.js";
import { COPILOT_ENV, COPILOT_SETTINGS } from "../copilot/argv.js";
import { KIMI_ENV } from "../kimi/argv.js";
import { MINIMAX_ENV } from "../minimax/argv.js";

// D-464: every subscription that can sign in and is not claude/codex/gemini has an adapter here; its env is the registry's.
describe("subscription adapters (D-464)", () => {
  it("each CLI the registry lets sign in runs through an adapter of its own id", () => {
    for (const cli of SubscriptionId.options.filter((c) => canSignIn(c) && !isKeyCli(c))) expect(subscriptionAdapter(cli, "default").id).toBe(cli);
  });
  it("a CLI without an adapter is refused", () => {
    expect(() => subscriptionAdapter("claude", "m")).toThrow(MandatError);
  });
  it("the sandbox env of Kimi (the registry) is what the adapter expects", () => {
    expect(SUBSCRIPTIONS.kimi.env).toEqual(KIMI_ENV);
    expect(SUBSCRIPTIONS.minimax.env).toMatchObject(MINIMAX_ENV);
    expect(SUBSCRIPTIONS.copilot.env).toEqual(COPILOT_ENV);
    expect(JSON.parse(SUBSCRIPTIONS.copilot.seed!.text)).toEqual(COPILOT_SETTINGS);
  });
});
