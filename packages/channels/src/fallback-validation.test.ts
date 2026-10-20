import { describe, expect, it } from "vitest";
import { manualSwitchAllowed, validateChain } from "./validate.js";
import { ch } from "./select.test-helper.js";

const chans = [
  ch({ id: "claude-a", label: "claude-a", kind: "cli_profile" }),
  ch({ id: "claude-b", label: "claude-b", kind: "cli_profile" }),
  ch({ id: "anthropic-key", label: "anthropic-key" }),
  ch({ id: "openai-key", label: "openai-key", provider: "openai" }),
  ch({ id: "openai-key-2", label: "openai-key-2", provider: "openai" }),
];

describe("fallback-validation (т. 8.3)", () => {
  it("claude-a → [claude-b] cli_profile → „втори акаунт на същия доставчик“", () => {
    expect(validateChain("claude-a", ["claude-b"], chans)).toEqual({ ok: false, errors: [{ error: "same_provider_cli_profile", label: "claude-b" }] });
  });
  it("два api_key на openai във веригата → грешка; api_key на същия доставчик е позволен", () => {
    expect(validateChain("anthropic-key", ["openai-key", "openai-key-2"], chans)).toEqual({ ok: false, errors: [{ error: "two_api_keys_same_provider", label: "openai" }] });
    expect(validateChain("claude-a", ["anthropic-key", "openai-key"], chans)).toEqual({ ok: true });
  });
  it("непознат label → грешка (задачата е BLOCKED)", () => {
    expect(validateChain("nope", ["openai-key"], chans)).toEqual({ ok: false, errors: [{ error: "unknown_label", label: "nope" }] });
  });
  it("ръчна смяна към cli_profile на същия доставчик → забранена", () => {
    expect(manualSwitchAllowed(chans[0] as never, chans[1] as never)).toBe(false);
    expect(manualSwitchAllowed(chans[2] as never, chans[3] as never)).toBe(true);
  });
});
