import { describe, expect, it } from "vitest";
import { MandatError } from "@mandat/contract";
import { SANDBOX_HARDENING, buildRunArgs } from "./index.js";

// E8e (v5 p. 4.5 (4), AC-5.3, D-354): the MCP sidecar is a sandbox container like any other (same hardening, 1000:1000),
// with its own volume only; it may carry the secrets its catalog row names, never an LLM key, never a work tree.
const ctx = { home: "/home/u", mandatHome: "/home/u/.mandat", runDir: "/home/u/.mandat/runs/r_x" };
const spec = (o: { envNames?: string[]; target?: string; source?: string } = {}) => ({
  role: "mcp" as const, runId: "r_x", image: "img", network: "mandat-mcp-r_x", user: "1000:1000" as const, envNames: o.envNames ?? ["ISSUES_TOKEN"], publicEnv: {},
  mounts: [{ kind: "volume" as const, source: o.source ?? "mandat-mcp-r_x-issues", target: o.target ?? "/m/mcp", readonly: false }],
});

describe("role mcp (sidecar)", () => {
  it("same hardening flags as the sandbox; the declared secret goes by name", () => {
    const a = buildRunArgs(spec(), ctx);
    for (const f of SANDBOX_HARDENING.filter((x) => !x.includes("<"))) expect(a).toContain(f);
    expect(a.join(" ")).toContain("-e ISSUES_TOKEN");
    expect(a.join(" ")).toContain("mandat-mcp-r_x-issues:/m/mcp");
  });
  it("never an LLM key, never a lowercase or odd name", () => {
    for (const n of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "AWS_SECRET_ACCESS_KEY", "token", "A-B"]) expect(() => buildRunArgs(spec({ envNames: [n] }), ctx)).toThrow(MandatError);
  });
  it("only its own mandat-mcp-* volume, only under /m/mcp (never a run tree volume or /m/work)", () => {
    expect(() => buildRunArgs(spec({ source: "mandat-vol-r_x-agent" }), ctx)).toThrow(MandatError);
    expect(() => buildRunArgs(spec({ target: "/m/work" }), ctx)).toThrow(MandatError);
  });
  it("other roles still refuse non-LLM secret names", () => {
    expect(() => buildRunArgs({ ...spec(), role: "agent" }, ctx)).toThrow(MandatError);
  });
});
