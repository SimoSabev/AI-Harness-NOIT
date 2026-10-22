import { describe, expect, it } from "vitest";
import { SidecarSpec, serverEnv } from "./spec.js";

describe("sidecar spec (D-354)", () => {
  it("the server gets PATH, HOME and its declared secrets only", () => {
    const spec = SidecarSpec.parse({ name: "issues", command: "npx", args: ["@example/issues-mcp@1.3.0"], approved_hash: null, enabled_tools: null, secrets: ["ISSUES_TOKEN"] });
    expect(serverEnv(spec, { PATH: "/bin", HOME: "/h", ISSUES_TOKEN: "t", OTHER_TOKEN: "x", MANDAT_MCP_SPEC: "{}" })).toEqual({ PATH: "/bin", HOME: "/h", ISSUES_TOKEN: "t" });
  });
  it("a spec with an unknown field or a bad secret name is refused", () => {
    expect(SidecarSpec.safeParse({ name: "x", command: "c", args: [], approved_hash: null, enabled_tools: null, secrets: ["lower"] }).success).toBe(false);
    expect(SidecarSpec.safeParse({ name: "x", command: "c", args: [], approved_hash: null, enabled_tools: null, secrets: [], extra: 1 }).success).toBe(false);
  });
});
