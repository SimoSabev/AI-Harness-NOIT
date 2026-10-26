import { sha256Tag } from "@mandat/contract";
import type { Sha256 } from "@mandat/contract";
import { NOTES_HINT, addMemory, loadMemory, memoryBlock, memoryFromNotes, recordUsage, rememberLines, renderCore, searchMemory } from "@mandat/memory";
import type { MemoryBlock, MemorySql } from "@mandat/memory";

// D-392: memory in the worker. Before a task: the person's "запомни:" lines become memories, then the frozen core and the
// slice for this task go into the contract (memory_hash) and the cost into memory_usage. After a task: the agent's
// "MEMORY:" notes become proposals that wait for a person (the sandbox never writes memory itself).

/** No person (a night or system task): no user-scope memory matches this id. */
const NOBODY = "00000000-0000-4000-8000-000000000000";

export interface TaskMemory {
  block: MemoryBlock;
  /** what the contract carries: the block plus how to suggest a memory */
  text: string;
  hash: Sha256;
}

export async function memoryForTask(db: MemorySql, t: { org: string; user: string | null; repo: string; taskId: string; attempt: number; text: string }): Promise<TaskMemory | null> {
  const user = t.user ?? NOBODY;
  if (t.user && t.attempt === 1) {
    for (const text of rememberLines(t.text)) {
      await addMemory(db, { org: t.org, user: t.user, note: { text, kind: "preference", scope: "user", basis: "user_said" }, source: "chat", actor: `human:${t.user}`, provenance: { task_id: t.taskId } });
    }
  }
  const items = await loadMemory(db, { org: t.org, user, repo: t.repo, statuses: ["active"] });
  const core = renderCore(items, t.repo);
  const recall = searchMemory(items, t.text, { repoId: t.repo }).map((h) => h.item);
  const block = memoryBlock(core, recall);
  if (!block) return null;
  const text = `${block.text}${NOTES_HINT}\n`;
  const hash = sha256Tag(text);
  const coreTokens = core.tokens.user + core.tokens.project;
  await recordUsage(db, { org: t.org, task_id: t.taskId, attempt: t.attempt, core_tokens: coreTokens, recall_tokens: Math.max(0, block.tokens - coreTokens), ids: [...block.core, ...block.recall], hash });
  return { block, text, hash };
}

/** The agent's MEMORY: lines → pending project memories (the scanner refuses rules, secrets, injections). */
export async function sandboxProposals(db: MemorySql, t: { org: string; user: string | null; repo: string; taskId: string; notes: string }): Promise<{ added: number; refused: number }> {
  let added = 0;
  let refused = 0;
  for (const text of memoryFromNotes(t.notes)) {
    if (text.length < 3 || text.length > 500) {
      refused++;
      continue;
    }
    const r = await addMemory(db, { org: t.org, user: t.user ?? NOBODY, note: { text, kind: "fact", scope: "project", basis: "observed", repo_id: t.repo }, source: "agent_sandbox", actor: "agent", provenance: { task_id: t.taskId }, createdBy: t.user });
    if (r.ok) added++;
    else refused++;
  }
  return { added, refused };
}
