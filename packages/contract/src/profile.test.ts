import { describe, expect, it } from "vitest";
import { HarnessProfile, Materialized, ProfileLayerC, ProfileLayerG, Subject, ToolPattern, profileHash, sealProfile } from "./index.js";
import { demoProfileLayers } from "./profile.fixture.js";

describe("harness profile (v5 2.2)", () => {
  it("seals: profile_hash = hashJcs(layers); a changed layer changes the hash", () => {
    const p = sealProfile({ version: 1, repo_id: "local", layers: demoProfileLayers(), sources: { "a.tests.command": "package_json" }, approved_by: null, approved_at: null });
    expect(HarnessProfile.parse(p).profile_hash).toBe(profileHash(p.layers));
    const other = { ...p.layers, g: { ...p.layers.g, mutants: 5 } };
    expect(profileHash(other)).not.toBe(p.profile_hash);
    expect(() => HarnessProfile.parse({ ...p, layers: other })).toThrow(/profile_hash/);
  });
  it("subjects and tool patterns", () => {
    for (const s of ["agent:claude", "agent:claude@lichno", "account:work", "night", "research", "any"]) expect(Subject.parse(s)).toBe(s);
    for (const s of ["agent:", "Agent:x", "root", "account:A B"]) expect(() => Subject.parse(s)).toThrow();
    for (const t of ["bash:git push *", "path:write:infra/**", "mcp:stripe.*", "net:api.segment.io"]) expect(ToolPattern.parse(t)).toBe(t);
    expect(() => ToolPattern.parse("telepathy:x")).toThrow();
  });
  it("layer C: allow | ask | deny with a reason; at most 500 rules", () => {
    const r = { subject: "any", tool: "bash:git push *", decision: "deny", reason: "the harness delivers" };
    expect(ProfileLayerC.parse([r])).toHaveLength(1);
    expect(() => ProfileLayerC.parse([{ ...r, decision: "maybe" }])).toThrow();
    expect(() => ProfileLayerC.parse(Array.from({ length: 501 }, () => r))).toThrow();
  });
  it("layer G defaults: wip 3, ci rounds 2, same_file wait, review off, hidden tests dir", () => {
    const g = ProfileLayerG.parse({ required_detectors: ["D1"], mutants: 3, max_diff_lines: 400, ui_paths: [], definition_of_done: {}, max_subagents: 2, max_depth: 1 });
    expect(g).toMatchObject({ wip_limit: 3, ci_rounds: 2, same_file: "wait", review: "off", hidden_tests_dir: "tests/__hidden__", requires_research: [] });
    expect(() => ProfileLayerG.parse({ ...g, max_depth: 4 })).toThrow();
    // E9b (D12): the routes a UI check opens are optional (absent → "/"), on the app's own origin only
    expect(g.ui_routes).toBeUndefined();
    expect(ProfileLayerG.parse({ ...g, ui_routes: ["/", "/cart"] }).ui_routes).toEqual(["/", "/cart"]);
    expect(() => ProfileLayerG.parse({ ...g, ui_routes: ["https://evil.example/"] })).toThrow();
  });
  it("hooks are only harness scripts, never a path from the repo", () => {
    const layers = demoProfileLayers();
    expect(() => HarnessProfile.shape.layers.parse({ ...layers, d: [{ event: "pre_tool", matcher: null, script: "./repo/hook.sh", args: {} }] })).toThrow();
  });
  it("materialized files are relative, mode 0444/0555", () => {
    const m = { files: [{ path: "settings.json", bytes: "{}", mode: "0444" }], argv: ["--bare"], env: {}, enforced_by_harness: [], unsupported: [] };
    expect(Materialized.parse(m).files).toHaveLength(1);
    expect(() => Materialized.parse({ ...m, files: [{ path: "/etc/x", bytes: "", mode: "0444" }] })).toThrow();
    expect(() => Materialized.parse({ ...m, files: [{ path: "a/../../x", bytes: "", mode: "0444" }] })).toThrow();
    expect(() => Materialized.parse({ ...m, files: [{ path: "x", bytes: "", mode: "0777" }] })).toThrow();
  });
});
