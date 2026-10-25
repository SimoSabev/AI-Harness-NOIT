import type { ScanResult } from "./scan.js";

// E7г (v5 т. 3.4 (2), AC-1.6): risk by folder rules, no AI. Every class names the rule that set it (source rule:<name>).
export interface RiskPath { glob: string; rule: `rule:${string}` }
export interface RiskProfile { high: RiskPath[]; medium: RiskPath[]; low: RiskPath[] }

const HIGH: [RegExp, string][] = [
  [/^migrations?$/, "migrations"],
  [/^infra(structure)?$/, "infra"],
  [/^deploy(ments?)?$/, "deploy"],
  [/^\.github$/, "github"],
  [/^auth(entication)?$/, "auth"],
  [/^payments?$/, "payment"],
  [/^billing$/, "billing"],
];

export function riskProfile(scan: ScanResult): RiskProfile {
  const high = new Map<string, RiskPath>();
  for (const dir of scan.folderTree) {
    const segs = dir.split("/");
    for (let i = 0; i < segs.length; i++) {
      const hit = HIGH.find(([re]) => re.test(segs[i] ?? ""));
      if (hit) {
        const glob = `${segs.slice(0, i + 1).join("/")}/**`;
        if (!high.has(glob)) high.set(glob, { glob, rule: `rule:${hit[1]}` });
        break;
      }
    }
  }
  const dirs = new Set(scan.folderTree.map((d) => d.split("/")[0]));
  return {
    high: [...high.values()].sort((a, b) => (a.glob < b.glob ? -1 : 1)),
    medium: scan.srcDirs.map((d) => ({ glob: `${d}/**`, rule: "rule:src" as const })),
    low: [{ glob: "README.md", rule: "rule:docs" as const }, ...(dirs.has("docs") ? [{ glob: "docs/**", rule: "rule:docs" as const }] : [])],
  };
}
