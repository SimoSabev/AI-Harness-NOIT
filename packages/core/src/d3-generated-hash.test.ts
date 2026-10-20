import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { effectiveLevel, parseMandatYml, repoConfigFromPolicy } from "@mandat/contract";
import type { Evidence } from "@mandat/contract";
import { d3 } from "./d3.js";
import { ev } from "./evidence.js";
import { decideVerdict } from "./verdict.js";

// Демо промпт т. 8.2 (8): generated files (AGENTS.md, CLAUDE.md, .mandat.yml) are protected and config paths; an agent
// that touches one → D3 unknown → UNKNOWN, level ≤ 1 (the scenario fake:touch-config).
const p = parseMandatYml(readFileSync(new URL("../../../fixtures/demo-shop/.mandat.yml", import.meta.url), "utf8"));
if (!p.ok) throw new Error(p.error);
const rc = repoConfigFromPolicy(p.policy);
if (!rc.ok) throw new Error(rc.detail);
const snap = (files: Record<string, string>) => ({ get: (f: string) => (f in files ? Buffer.from(files[f] ?? "") : null) });

describe("d3-generated-hash", () => {
  for (const f of ["AGENTS.md", "CLAUDE.md", ".mandat.yml"]) {
    it(`агент сменя ${f} → UNKNOWN, ниво ≤ 1`, () => {
      const r = d3({ files: [{ path: f, status: "M", bytes: 10, binary: false }], base: snap({ [f]: "generated" }), head: snap({ [f]: "edited by agent" }), rc: rc.config });
      expect(r.evidence.status).toBe("unknown");
      expect(r.evidence.signature).toMatch(/^D3:protected_path:/);
      expect(r.security.map((s) => s.kind)).toContain("config_path_change");
      const all: Evidence[] = [ev("D1.base_tests", "pass", "20/20"), ev("D2.inventory", "pass", "20 → 20"), r.evidence];
      const v = decideVerdict(all);
      expect(v).toBe("UNKNOWN");
      expect(effectiveLevel({ ladder: 3, riskCap: 3, result: v, mode: "full", levelCap: 3, rulesetStrict: true, d7: "pass" }).level).toBeLessThanOrEqual(1);
    });
  }
});
