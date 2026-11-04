import type { Key } from "../../../i18n/t";

// D-487: pure helpers of the "MCP, tools and skills" section (no React), shared by the client parts and their tests.
export type ImportSource = "json" | "github" | "npm" | "registry" | "catalog" | "url";
export const SOURCES: readonly ImportSource[] = ["github", "npm", "registry", "catalog", "url", "json"];

/** A guess from what was pasted; the person can change it in the list. */
export function detectSource(raw: string): ImportSource {
  const s = raw.trim();
  if (s.startsWith("{") || s.startsWith("[")) return "json";
  if (/^https:\/\/(www\.)?github\.com\//.test(s)) return "github";
  if (/^https:\/\/(www\.)?smithery\.ai\//.test(s) || s.startsWith("smithery:")) return "catalog";
  if (/^https:\/\/(www\.)?npmjs\.com\/package\//.test(s)) return "npm";
  if (/^https?:\/\//.test(s)) return "url";
  if (/^[a-z][a-z0-9-]*\.[a-z0-9.-]+\/[A-Za-z0-9_.-]+$/.test(s)) return "registry"; // reverse-DNS: io.github.owner/name
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s) && !s.startsWith("@")) return "github";
  return "npm";
}

export function sourceBody(source: ImportSource, raw: string): Record<string, string> {
  const v = source === "json" ? raw : raw.trim();
  switch (source) {
    case "json":
      return { source, text: v };
    case "github":
    case "url":
      return { source, url: v };
    case "npm":
      return { source, spec: v };
    case "registry":
      return { source, name: v };
    case "catalog":
      return { source, input: v };
  }
}

export interface Candidate { name: string; transport: "stdio" | "http"; package: string | null; url: string | null; version: string | null; secrets: string[]; origin: string; problem: string | null; notes: string[]; findings: { tool: string; reason: string }[] }
export interface SkillCandidate { name: string; description: string; origin: string; blocked_reason: string | null }
export interface ServerRow { id: string; name: string; version: string | null; source: string; origin: string | null; vet_status: string; vet_findings: { tool: string; reason: string }[]; egress_hosts: string[]; secrets: string[] }
export interface SkillRow { id: string; name: string; description: string; source: string; approved: boolean; blocked_reason: string | null; origin: string | null }

/** D-486: what every new project has without setup (the names are shown; the texts come from the catalog). */
export const BUILTIN_TOOLS: readonly { name: string; kind: "mcp" | "skill" | "memory"; key: Key }[] = [
  { name: "mandat", kind: "mcp", key: "tt.builtin.mandat" },
  { name: "research", kind: "mcp", key: "tt.builtin.research" },
  { name: "memory", kind: "memory", key: "tt.builtin.memory" },
  { name: "test-first", kind: "skill", key: "tt.builtin.testFirst" },
  { name: "review", kind: "skill", key: "tt.builtin.review" },
  { name: "research-skill", kind: "skill", key: "tt.builtin.researchSkill" },
];

export const matches = (q: string, ...xs: (string | null)[]) => {
  const s = q.trim().toLowerCase();
  return s === "" || xs.some((x) => (x ?? "").toLowerCase().includes(s));
};
