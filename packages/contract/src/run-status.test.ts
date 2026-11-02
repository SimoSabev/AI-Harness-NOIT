import { describe, expect, it } from "vitest";
import { AgentEnding, ProviderProblem, RunPhase, StreamEvent, agentFailedCause, agentFailedReason, createStreamCtx, decodeProviderNotice, encodeProviderNotice, streamEvent } from "./index.js";

describe("what a running task is doing (D-446)", () => {
  it("the phases and the provider problems are closed sets", () => {
    expect(RunPhase.options).toEqual(["provision", "install", "agent", "export", "verify", "verdict"]);
    expect(ProviderProblem.options).toEqual(["overloaded", "rate_limited", "timed_out", "key_rejected", "unknown"]);
  });
  it("a notice travels as a code, with its attempt when the CLI said one", () => {
    for (const n of [
      { problem: "overloaded", attempt: 4, max: 10 },
      { problem: "timed_out", attempt: 2, max: null },
      { problem: "rate_limited", attempt: null, max: null },
    ] as const) expect(decodeProviderNotice(encodeProviderNotice(n))).toEqual(n);
    expect(encodeProviderNotice({ problem: "overloaded", attempt: 4, max: 10 })).toBe("overloaded 4/10");
  });
  it("anything that is not exactly a code decodes to nothing: free text can never pass as a notice", () => {
    for (const t of ["", "overloaded because of high demand", "telepathy 1/2", "overloaded 1/2 x", "overloaded -1/2", "OVERLOADED", "overloaded 1/"]) expect(decodeProviderNotice(t), t).toBeNull();
  });
  it("the two kinds are stream events of their own, so an agent's text cannot pose as one", () => {
    const c = createStreamCtx("r_01JABCDEFGHJKMNPQRSTVWXYZ0", () => "2026-10-22T10:00:00.000Z");
    expect(StreamEvent.parse(streamEvent(c, { kind: "phase", text: "install" }))).toMatchObject({ kind: "phase", text: "install" });
    expect(StreamEvent.parse(streamEvent(c, { kind: "provider", text: "overloaded 4/10" }))).toMatchObject({ kind: "provider", text: "overloaded 4/10" });
  });
  it("how the agent ended: facts only, strict", () => {
    expect(AgentEnding.parse({ ok: false, replied: false, cause: "overloaded" }).cause).toBe("overloaded");
    expect(() => AgentEnding.parse({ ok: true, replied: true, cause: "telepathy" })).toThrow();
    expect(() => AgentEnding.parse({ ok: true, replied: true, cause: null, said: "all good" })).toThrow();
  });
  it("the wait reason of a failed agent carries only a code", () => {
    expect(agentFailedReason("overloaded")).toBe("agent_failed:overloaded");
    expect(agentFailedCause("agent_failed:timed_out")).toBe("timed_out");
    for (const w of ["agent_failed:", "agent_failed:raw text", "empty_change", null]) expect(agentFailedCause(w), String(w)).toBeNull();
  });
});
