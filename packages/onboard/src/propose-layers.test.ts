import { HarnessProfile, profileHash } from "@mandat/contract";
import { describe, expect, it } from "vitest";
import { FIXTURES, memView } from "./fixtures.test-helper.js";
import { proposeProfile, scanRepo } from "./index.js";

const history = { subjects: ["fix: cart rounding", "feat: coupons", "docs: readme", "fix(cart): threshold"], diffLines: [12, 40, 3, 8] };

describe("proposeProfile: all 8 layers without AI (E8б, AC-2.1)", () => {
  for (const [name, files] of Object.entries(FIXTURES)) {
    it(`${name} → a valid unapproved HarnessProfile with sources; deterministic (snapshot)`, () => {
      const scan = scanRepo(memView({ ...files, ".editorconfig": "[*]\nindent_style = space\nindent_size = 2\n", ".prettierrc": "{}" }));
      const p = proposeProfile(scan, { repoId: "local", version: 1, history });
      expect(HarnessProfile.parse(p.profile).profile_hash).toBe(profileHash(p.profile.layers));
      expect(p.profile.approved_by).toBeNull();
      expect(proposeProfile(scan, { repoId: "local", version: 1, history }).profile.profile_hash).toBe(p.profile.profile_hash);
      expect(Object.keys(p.profile.layers)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
      expect(p.profile).toMatchSnapshot();
    });
  }
  it("layer B: commands from scripts, style from .editorconfig/.prettierrc, conventions from git history; summary empty (no model)", () => {
    const scan = scanRepo(memView({ ...FIXTURES["npm-vitest"], ".editorconfig": "[*]\nindent_style = space\nindent_size = 2\n", ".prettierrc": "{}" }));
    const p = proposeProfile(scan, { repoId: "local", version: 1, history });
    const b = p.profile.layers.b;
    expect(b.summary).toBe("");
    expect(b.commands.test).toBe("npm test");
    expect(b.commands.lint).toBe("npm run lint");
    expect(b.style).toEqual(expect.arrayContaining(["indent: 2 spaces (.editorconfig)", "formatter: prettier (.prettierrc)"]));
    expect(b.conventions).toEqual(expect.arrayContaining(["commit titles: conventional (<type>: <what>) in 4/4", "median change: 10 lines"]));
    expect(p.sources["b.conventions"]).toBe("git_history");
    expect(p.sources["b.style"]).toBe("repo_file");
  });
  it("layer C/D/E/F defaults: no push, no curl/wget, high-risk folders write-denied; harness hooks; the mandat MCP server; a reviewer role", () => {
    const scan = scanRepo(memView({ ...FIXTURES["npm-vitest"], "infra/main.tf": "x" }));
    const l = proposeProfile(scan, { repoId: "local", version: 1 }).profile.layers;
    expect(l.c.map((r) => [r.tool, r.decision])).toEqual(expect.arrayContaining([["bash:git push *", "deny"], ["bash:curl *", "deny"], ["bash:wget *", "deny"], ["path:write:infra/**", "deny"]]));
    expect(l.d.map((h) => h.script)).toEqual(["deny-by-policy", "require-tests-ran"]);
    expect(l.e.mcp.map((m) => m.name)).toEqual(["mandat"]);
    expect(l.f.roles.map((r) => r.role)).toEqual(["reviewer"]);
    expect(l.g.required_detectors).toEqual(["D1", "D2", "D3", "D4", "D10"]);
    expect(l.h.budgets).toEqual(l.a.budgets);
  });
});
