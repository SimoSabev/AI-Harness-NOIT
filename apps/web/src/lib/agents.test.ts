import { describe, expect, it } from "vitest";
import { AGENTS, AGENT_IDS, agentHint, agentLabel } from "./agents";
import { CreateTaskBody } from "./server/actions";

// D-292: the minimal harness — real agents (key in the proxy) + demo agents (no key) that show each verdict.
describe("agents (D-292)", () => {
  it("claude/codex need a key; the demo agents are the fake scenarios with a fixed change", () => {
    expect(AGENT_IDS).toEqual(["claude", "codex", "fake:honest-fix", "fake:delete-test", "fake:skip-test", "fake:untested-extra"]);
    expect(AGENTS.filter((a) => a.needsKey).map((a) => a.id)).toEqual(["claude", "codex"]);
    for (const a of AGENTS) for (const lang of ["en", "bg"] as const) {
      expect(agentLabel(a.id, lang).length).toBeGreaterThan(0);
      expect(agentHint(a.id, lang).length).toBeGreaterThan(10);
    }
  });
  it("CreateTaskBody accepts every listed agent and nothing else", () => {
    for (const agent of AGENT_IDS) expect(CreateTaskBody.safeParse({ type: "bugfix", agent, text: "x" }).success).toBe(true);
    expect(CreateTaskBody.safeParse({ type: "bugfix", agent: "fake:r8-canary-leak", text: "x" }).success).toBe(false);
  });
  it("D-295: claude@<account> is accepted; a bad account name is not", () => {
    expect(CreateTaskBody.safeParse({ type: "bugfix", agent: "claude@work", text: "x" }).success).toBe(true);
    for (const agent of ["claude@", "claude@Work", "claude@a b", "codex@x"]) expect(CreateTaskBody.safeParse({ type: "bugfix", agent, text: "x" }).success).toBe(false);
    expect(agentLabel("claude@work")).toBe("Claude Code · work");
  });
  it("agentLabel: known → label, unknown → the id itself", () => {
    expect(agentLabel("fake:delete-test")).toBe("Demo: deletes a test");
    expect(agentLabel("fake:delete-test", "bg")).toMatch(/трие тест/);
    expect(agentLabel("fake-codex:replay")).toBe("fake-codex:replay");
  });
});
