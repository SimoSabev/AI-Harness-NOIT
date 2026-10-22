import { hashJcs } from "@mandat/contract";
import type { Sha256 } from "@mandat/contract";

// E8e (v5 p. 4.5 (3), AC-5.1/5.2, D-354): an MCP server's tool definitions are untrusted text that reaches the model.
// On approval they are hashed and scanned; at every later start the hash must be the approved one.
export interface ToolDef { name: string; description?: string | undefined; inputSchema?: unknown }
export interface Finding { tool: string; reason: "invisible_char" | "instruction"; match: string }

const norm = (t: ToolDef) => ({ name: t.name, description: t.description ?? "", inputSchema: t.inputSchema ?? null });

/** One hash for the whole server: {name, description, inputSchema} of every tool, sorted by name (JCS). */
export function toolDefsHash(tools: readonly ToolDef[]): Sha256 {
  return hashJcs([...tools].map(norm).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)));
}

/** Per tool (mcp_tool_defs rows): which tool changed, for the "the tools changed" card. */
export function toolDefHashes(tools: readonly ToolDef[]): { name: string; description_hash: Sha256; schema_hash: Sha256 }[] {
  return [...tools].map(norm).sort((a, b) => (a.name < b.name ? -1 : 1)).map((t) => ({ name: t.name, description_hash: hashJcs(t.description), schema_hash: hashJcs(t.inputSchema) }));
}

// bidi controls, zero-width characters, word joiners, BOM and the Unicode tag block (ASCII smuggling)
const INVISIBLE = /[​-‏‪-‮⁠-⁤﻿]|[\u{E0000}-\u{E007F}]/u;
/** Instructions aimed at the model, not descriptions of a tool (the v5 list + close variants). */
const INSTRUCTIONS: readonly RegExp[] = [
  /\b(ignore|disregard|forget)\s+(all\s+)?(the\s+)?(previous|prior|above|earlier)\b/i,
  /\bdo\s+not\s+(tell|inform|mention|reveal)\b/i,
  /<\s*\/?\s*(important|system|instructions?)\s*>/i,
  /\b(read|cat|open|send|upload)\b[^.]{0,40}(~\/\.ssh|id_rsa|~\/\.aws|\.env\b|\/etc\/passwd)/i,
  /\bsystem\s+prompt\b/i,
];

function texts(t: ToolDef): string[] {
  const out = [t.name, t.description ?? ""];
  const walk = (v: unknown): void => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (out.push(k), walk(x));
  };
  walk(t.inputSchema);
  return out;
}

/** Every finding names its tool (AC-5.2); one finding per tool and reason. */
export function scanToolDefs(tools: readonly ToolDef[]): Finding[] {
  const out: Finding[] = [];
  for (const t of tools) {
    const all = texts(t).join("\n");
    const inv = INVISIBLE.exec(all);
    if (inv) out.push({ tool: t.name, reason: "invisible_char", match: `U+${(inv[0].codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}` });
    for (const re of INSTRUCTIONS) {
      const m = re.exec(all);
      if (m) {
        out.push({ tool: t.name, reason: "instruction", match: m[0].slice(0, 80) });
        break;
      }
    }
  }
  return out;
}

export interface Vetting { ok: boolean; hash: Sha256; findings: Finding[]; changed: boolean }
/** approvedHash null = the first approval. ok only without findings and with the approved hash (if there is one). */
export function vetServer(tools: readonly ToolDef[], approvedHash: Sha256 | null): Vetting {
  const hash = toolDefsHash(tools);
  const findings = scanToolDefs(tools);
  const changed = approvedHash !== null && approvedHash !== hash;
  return { ok: findings.length === 0 && !changed, hash, findings, changed };
}
