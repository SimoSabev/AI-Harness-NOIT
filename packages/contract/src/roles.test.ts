import { describe, expect, it } from "vitest";
import { BUILTIN_ROLES, Capability, DANGEROUS, Role, roleCan } from "./index.js";

describe("roles with capabilities (v5 2.3, D-315)", () => {
  const b = (n: string) => {
    const r = BUILTIN_ROLES.find((x) => x.name === n);
    if (!r) throw new Error(n);
    return r;
  };
  it("owner has everything; viewer only views and downloads", () => {
    expect([...b("owner").capabilities].sort()).toEqual([...Capability.options].sort());
    expect([...b("viewer").capabilities].sort()).toEqual(["diff.view", "docs.download"]);
  });
  it("worker = everything except the dangerous ones; dangerous = what worker lacks", () => {
    const w = new Set(b("worker").capabilities);
    for (const c of ["keys.manage", "accounts.manage", "roles.manage", "members.manage", "projects.delete", "approve.level2", "approve.rules", "settings.manage"] as const) {
      expect(w.has(c)).toBe(false);
      expect(DANGEROUS.has(c)).toBe(true);
    }
    expect(Capability.options.filter((c) => !w.has(c)).sort()).toEqual([...DANGEROUS].sort());
  });
  it("approver and agent-operator", () => {
    expect(b("approver").capabilities).toContain("approve.level2");
    expect(b("approver").capabilities).not.toContain("task.steer");
    expect(b("agent-operator").capabilities).toContain("task.steer");
    expect(b("agent-operator").capabilities).not.toContain("approve.level1");
  });
  it("builtin roles are valid and flagged builtin", () => {
    for (const r of BUILTIN_ROLES) expect(Role.parse(r).builtin).toBe(true);
  });
  it("scope: repo, task type, level cap", () => {
    const docsReviewer = Role.parse({
      id: "3f6c1c56-8b38-4a3b-a5a3-0f43a0d1b0a1",
      org_id: "o_local",
      name: "docs reviewer",
      builtin: false,
      capabilities: ["approve.level1", "approve.level2", "diff.view"],
      scope: { repos: ["0b9e3b9e-6f73-4c8f-9a11-2b8f8f1f3e01"], task_types: ["docs"], level_cap: 2, budget_usd_day: null },
    });
    const repo = "0b9e3b9e-6f73-4c8f-9a11-2b8f8f1f3e01";
    expect(roleCan(docsReviewer, "approve.level2", { repo_id: repo, task_type: "docs", level: 2 })).toBe(true);
    expect(roleCan(docsReviewer, "approve.level2", { repo_id: repo, task_type: "bugfix", level: 2 })).toBe(false);
    expect(roleCan(docsReviewer, "approve.level2", { repo_id: "11111111-1111-4111-8111-111111111111", task_type: "docs" })).toBe(false);
    expect(roleCan(docsReviewer, "approve.level2", { repo_id: repo, task_type: "docs", level: 3 })).toBe(false);
    expect(roleCan(docsReviewer, "keys.manage", {})).toBe(false);
    expect(roleCan(b("owner"), "keys.manage", {})).toBe(true);
  });
  it("rejects an unknown capability and a bad name", () => {
    expect(() => Role.parse({ ...b("viewer"), capabilities: ["root"] })).toThrow();
    expect(() => Role.parse({ ...b("viewer"), name: "" })).toThrow();
  });
});
