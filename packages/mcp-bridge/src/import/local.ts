import path from "node:path";
import { isObj } from "./candidate.js";
import type { ImportCandidate } from "./candidate.js";
import { fromServers, parseCodexToml, serversOf } from "./config.js";
import { parseSkill } from "./skill.js";
import type { SkillCandidate } from "./skill.js";

// D-485: "already connected" — the MCP servers and skills a person has in Claude Code, Cursor, Gemini CLI and Codex on
// this machine. Read only after their consent and only these files; never auth/credential files. Only the server
// sections are projected; env/header values are dropped while parsing and never leave this function.
export type Client = "claude" | "cursor" | "gemini" | "codex";
export interface LocalIo { home: string; read: (file: string) => Promise<string | null>; list: (dir: string) => Promise<string[]> }
export interface LocalFound { mcp: ImportCandidate[]; skills: SkillCandidate[]; unreadable: Client[] }

const JSON_FILES: { client: Exclude<Client, "codex">; file: string[] }[] = [
  { client: "claude", file: [".claude.json"] },
  { client: "cursor", file: [".cursor", "mcp.json"] },
  { client: "gemini", file: [".gemini", "settings.json"] },
];
const SKILL_DIRS: { client: Client; dir: string[] }[] = [
  { client: "claude", dir: [".claude", "skills"] },
  { client: "codex", dir: [".codex", "skills"] },
];

function jsonServers(client: Client, text: string): ImportCandidate[] {
  const o: unknown = JSON.parse(text);
  if (!isObj(o)) return [];
  const origin = `local:${client}`;
  const top = serversOf(o);
  const out = top ? fromServers(top, origin) : [];
  // Claude Code keeps local-scope servers per project: projects[<path>].mcpServers
  if (client === "claude" && isObj(o.projects)) {
    for (const p of Object.values(o.projects).slice(0, 200)) if (isObj(p) && isObj(p.mcpServers)) out.push(...fromServers(p.mcpServers, origin));
  }
  return out;
}

export async function discoverLocal(io: LocalIo): Promise<LocalFound> {
  const mcp: ImportCandidate[] = [];
  const skills: SkillCandidate[] = [];
  const unreadable: Client[] = [];
  for (const { client, file } of JSON_FILES) {
    const text = await io.read(path.join(io.home, ...file)).catch(() => null);
    if (text === null) continue;
    try {
      mcp.push(...jsonServers(client, text));
    } catch {
      unreadable.push(client);
    }
  }
  const toml = await io.read(path.join(io.home, ".codex", "config.toml")).catch(() => null);
  if (toml !== null) mcp.push(...parseCodexToml(toml, "local:codex"));
  for (const { client, dir } of SKILL_DIRS) {
    const d = path.join(io.home, ...dir);
    for (const n of (await io.list(d).catch(() => [])).filter((x) => /^[A-Za-z0-9_.-]{1,64}$/.test(x) && x !== "." && x !== "..").slice(0, 60)) {
      const text = await io.read(path.join(d, n, "SKILL.md")).catch(() => null);
      if (text !== null) skills.push(parseSkill(text, `local:${client}`, n));
    }
  }
  const seen = new Set<string>();
  const dedup = mcp.filter((c) => {
    const k = `${c.origin}|${c.name}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { mcp: dedup, skills, unreadable };
}
