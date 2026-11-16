import type { MemoryItem } from "@mandat/contract";

// Round 2: memory in time, without new columns. A memory is valid from created_at until invalid_at; its history
// (memory_events) says what its text and status were at any moment, so "as of" a date replays that history.
// staleAgainstRepo: a project memory that names a file or a script the repository no longer has may be out of date —
// a suggestion for the person, never a change made alone.

export interface TimedEvent { action: string; at: string; before: unknown; after: unknown }
export interface RepoFacts { files: ReadonlySet<string>; scripts: Readonly<Record<string, string>> | null }
export interface StaleMemory { id: string; why: string[] }

type Status = MemoryItem["status"];
const AFTER: Record<string, Status> = { approved: "active", restored: "active", rejected: "rejected", archived: "archived", merged: "archived", superseded: "invalid" };

const field = (o: unknown, k: string): unknown => (o !== null && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined);

/** The memories that were active at `at`, each with its text of that moment. */
export function memoryAsOf(items: readonly MemoryItem[], history: Readonly<Record<string, readonly TimedEvent[]>>, at: string): MemoryItem[] {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return [];
  const out: MemoryItem[] = [];
  for (const m of items) {
    if (Date.parse(m.created_at) > t) continue;
    if (m.invalid_at !== null && Date.parse(m.invalid_at) <= t) continue;
    const events = [...(history[m.id] ?? [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const created = events.find((e) => e.action === "created");
    let text = m.text;
    // without a history the present status is the best we know (an invalid one was valid until invalid_at)
    let status: Status = m.status === "invalid" ? "active" : m.status;
    if (created) {
      const ct = field(created.after, "text");
      const cs = field(created.after, "status");
      text = typeof ct === "string" ? ct : m.text;
      status = typeof cs === "string" ? (cs as Status) : "active";
    }
    for (const e of events) {
      if (e === created || Date.parse(e.at) > t) continue;
      const et = field(e.after, "text");
      if (e.action === "edited" && typeof et === "string") text = et;
      const s = AFTER[e.action];
      if (s) status = s;
    }
    if (status === "active") out.push({ ...m, text, status });
  }
  return out;
}

const URL = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;
const PATH = /(?:^|[\s`'"(])((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,6})(?=$|[\s`'"),;:]|\.(?:\s|$))/g;
const SCRIPT = /\b(?:pnpm|yarn)(?:\s+run)?\s+([a-z][\w:.-]*)|\bnpm\s+run\s+([a-z][\w:.-]*)/g;
/** package manager commands of their own, not scripts of the project */
const BUILTIN = new Set(["install", "i", "add", "remove", "rm", "exec", "dlx", "run", "why", "list", "ls", "update", "up", "init", "create", "publish", "audit", "outdated", "store", "config", "help", "link", "unlink", "rebuild", "prune", "fetch", "import", "licenses", "patch", "setup", "env", "root", "bin", "dedupe", "pack", "version", "workspace", "workspaces"]);

/** Active project memories naming a path or a package script the repository does not have; the reasons, in text order. */
export function staleAgainstRepo(items: readonly MemoryItem[], repo: RepoFacts): StaleMemory[] {
  const out: StaleMemory[] = [];
  for (const m of items) {
    if (m.scope !== "project" || m.status !== "active") continue;
    const text = m.text.replace(URL, " ");
    const why: string[] = [];
    for (const x of text.matchAll(PATH)) {
      const p = x[1] ?? "";
      if (!repo.files.has(p) && !why.includes(`path:${p}`)) why.push(`path:${p}`);
    }
    if (repo.scripts) {
      for (const x of text.matchAll(SCRIPT)) {
        const s = x[1] ?? x[2] ?? "";
        if (BUILTIN.has(s) || Object.hasOwn(repo.scripts, s) || why.includes(`script:${s}`)) continue;
        why.push(`script:${s}`);
      }
    }
    if (why.length > 0) out.push({ id: m.id, why });
  }
  return out;
}
