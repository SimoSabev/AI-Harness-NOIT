import type { ChatTurn, ProjectBrief } from "@mandat/contract";
import type { Key } from "../i18n/t";

// D-599: the brief of a project, written live while the interview asks (the profile tiles of the brand kit). Pure: each
// part comes from the latest note of the model that names it (with where from: the code or the person), else from the
// proposed brief. The parts the latest note wrote are fresh, so they land on screen.
export type Part = "product" | "stack" | "commands" | "users" | "works_today" | "must_not_break" | "approver" | "budget_usd";
export interface Tile { part: Part; label: Key; value: string | null; from: "code" | "person" | null; fresh: boolean }

const PARTS: { part: Part; label: Key }[] = [
  { part: "product", label: "project.brief.product" },
  { part: "stack", label: "project.brief.stack" },
  { part: "commands", label: "project.brief.commands" },
  { part: "users", label: "project.brief.users" },
  { part: "works_today", label: "project.brief.works" },
  { part: "must_not_break", label: "project.brief.keep" },
  { part: "approver", label: "project.brief.approverOnly" },
  { part: "budget_usd", label: "project.brief.budget" },
];

function text(part: Part, v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (part === "commands" && typeof v === "object") {
    const c = Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x === "string" && x !== "");
    return c.length > 0 ? c.map(([k, x]) => `${k}: ${String(x)}`).join("\n") : null;
  }
  if (part === "budget_usd" && typeof v === "number") return `${v} USD`;
  if (Array.isArray(v)) return v.length > 0 ? v.join(" · ") : null;
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

export function profileOf(turns: readonly ChatTurn[]): { tiles: Tile[]; filled: number } {
  const got = new Map<Part, { value: string; from: "code" | "person" | null; seq: number }>();
  let lastNote = -1;
  for (const t of turns) {
    if (t.kind === "project_note") {
      lastNote = t.seq;
      for (const { part } of PARTS) {
        const v = text(part, (t.parts as Partial<ProjectBrief>)[part]);
        if (v !== null) got.set(part, { value: v, from: t.from, seq: t.seq });
      }
    } else if (t.kind === "project") {
      for (const { part } of PARTS) {
        const v = text(part, t.brief[part]);
        if (v !== null && !got.has(part)) got.set(part, { value: v, from: null, seq: t.seq });
      }
    }
  }
  const tiles = PARTS.map(({ part, label }) => {
    const g = got.get(part);
    return { part, label, value: g?.value ?? null, from: g?.from ?? null, fresh: g !== undefined && g.seq === lastNote };
  });
  return { tiles, filled: tiles.filter((x) => x.value !== null).length };
}
