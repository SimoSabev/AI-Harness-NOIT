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
    // D-486: the built-in set is on without setup — research (search, pages, docs) and the harness's skills
    expect(l.e.mcp.map((m) => m.name)).toEqual(["mandat", "research"]);
    expect(l.e.skills.filter((k) => k.source === "builtin").map((k) => k.name)).toEqual(["test-first", "review", "research"]);
    expect(l.f.roles.map((r) => r.role)).toEqual(["reviewer"]);
    expect(l.g.required_detectors).toEqual(["D1", "D2", "D3", "D4", "D10"]);
    expect(l.h.budgets).toEqual(l.a.budgets);
  });
});

// D-601: the approved brief of the project (its interview, D-557/D-600) goes into the proposed profile — the summary, the
// commands the person confirmed and what must not break as boundaries, each with the source "human".
describe("the profile from the approved brief (D-601)", () => {
  const brief = { product: "An online shop for a bakery", users: ["customers", "staff"], works_today: ["checkout"], must_not_break: ["payments", "orders are saved"], commands: { install: "pnpm i", test: "pnpm test --run", dev: "pnpm dev" }, stack: ["TypeScript"], approver: "Simo", budget_usd: 5, notes: [] };
  it("layer B carries the brief; its fields say the person gave them; the profile stays valid and sealed", () => {
    const scan = scanRepo(memView(FIXTURES["npm-vitest"]));
    const p = proposeProfile(scan, { repoId: "local", version: 1, brief });
    expect(p.profile.layers.b.summary).toContain("An online shop for a bakery");
    expect(p.profile.layers.b.summary).toContain("customers");
    expect(p.profile.layers.b.commands).toMatchObject({ install: "pnpm i", test: "pnpm test --run", dev: "pnpm dev" });
    expect(p.profile.layers.b.boundaries.slice(0, 2)).toEqual(["Must keep working: payments", "Must keep working: orders are saved"]);
    expect(p.sources).toMatchObject({ "b.summary": "human", "b.commands": "human", "b.boundaries": "human" });
    expect(HarnessProfile.safeParse(p.profile).success).toBe(true);
    expect(p.profile.profile_hash).toBe(profileHash(p.profile.layers));
  });
  it("without a brief nothing changes", () => {
    const scan = scanRepo(memView(FIXTURES["npm-vitest"]));
    expect(proposeProfile(scan, { repoId: "local", version: 1, brief: null }).profile.profile_hash).toBe(proposeProfile(scan, { repoId: "local", version: 1 }).profile.profile_hash);
  });
});
