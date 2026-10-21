import { describe, expect, it } from "vitest";
import { profileOfAgent, providerOfAgent } from "./channels.js";

// D-295: "claude@<profile>" = Claude Code with that subscription profile.
describe("profileOfAgent (D-295)", () => {
  it("claude@name → name; anything else → null; provider anthropic", () => {
    expect(profileOfAgent("claude@work")).toBe("work");
    expect(profileOfAgent("claude@default")).toBe("default");
    for (const a of ["claude", "claude@", "claude@Work", "codex@x", "fake:honest-fix", "claude@../x"]) expect(profileOfAgent(a)).toBe(null);
    expect(providerOfAgent("claude@work")).toBe("anthropic");
  });
});
