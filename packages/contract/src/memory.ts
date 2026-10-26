import { z } from "zod";
import { TaskId } from "./schemas.js";

// D-392: Mandat's memory. Facts and preferences with provenance, written by trust level; rules and permissions never
// live here (they stay proposals with approval, PRD-9). The agent sees only the memory block of its contract.

/** Token budgets: the frozen core (user, project) and one recall (the slice picked for a task or a search). */
export const MEMORY_BUDGET = Object.freeze({ user: 500, project: 800, recall: 1500 });
export const MEMORY_TEXT_MAX = 500;
/** The rendered memory block of an agent contract (core + recall, with headers) never exceeds this. */
export const MEMORY_BLOCK_MAX = 12_000;

export const MemoryScope = z.enum(["user", "project", "session"]);
export type MemoryScope = z.infer<typeof MemoryScope>;
export const MemoryKind = z.enum(["preference", "convention", "command", "pitfall", "fact", "note", "episode"]);
export type MemoryKind = z.infer<typeof MemoryKind>;
/** who wrote it: the person (menu, "запомни:" in a task), an agent in a session, an agent in the sandbox, consolidation */
export const MemorySource = z.enum(["human", "chat", "agent_session", "agent_sandbox", "consolidation"]);
export type MemorySource = z.infer<typeof MemorySource>;
/** an agent's ground: the person said it, or it read it in files, the web, an MCP or a tool's output */
export const MemoryBasis = z.enum(["user_said", "observed"]);
export type MemoryBasis = z.infer<typeof MemoryBasis>;
export const MemoryStatus = z.enum(["active", "pending", "rejected", "invalid", "archived"]);
export type MemoryStatus = z.infer<typeof MemoryStatus>;

export const MemoryText = z.string().trim().min(3).max(MEMORY_TEXT_MAX);
const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const Instant = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/);
const Entity = z.string().min(1).max(80);

export const MemoryProvenance = z
  .object({ task_id: TaskId.optional(), session: z.string().max(80).optional(), note: z.string().max(200).optional() })
  .strict();
export type MemoryProvenance = z.infer<typeof MemoryProvenance>;

export const MemoryItem = z
  .object({
    id: Uuid,
    scope: MemoryScope,
    kind: MemoryKind,
    text: MemoryText,
    status: MemoryStatus,
    source: MemorySource,
    basis: MemoryBasis.nullable(),
    repo_id: Uuid.nullable(),
    entities: z.array(Entity).max(20),
    pinned: z.boolean(),
    uses: z.number().int().min(0),
    last_used_at: Instant.nullable(),
    created_at: Instant,
    invalid_at: Instant.nullable(),
    superseded_by: Uuid.nullable(),
    provenance: MemoryProvenance,
  })
  .strict();
export type MemoryItem = z.infer<typeof MemoryItem>;

/** A new memory from a person or an agent. Session notes are not stored (they live in the session only). */
export const MemoryNote = z
  .object({
    text: MemoryText,
    kind: MemoryKind,
    scope: MemoryScope.exclude(["session"]),
    basis: MemoryBasis.default("observed"),
    repo_id: Uuid.optional(),
  })
  .strict();
export type MemoryNote = z.infer<typeof MemoryNote>;

export const MemorySearch = z
  .object({ q: z.string().trim().min(1).max(200), scope: MemoryScope.optional(), repo_id: Uuid.optional(), limit: z.number().int().min(1).max(20).default(8) })
  .strict();
export type MemorySearch = z.infer<typeof MemorySearch>;

export const MemoryPatch = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), text: MemoryText.optional(), kind: MemoryKind.optional() }).strict().refine((p) => p.text !== undefined || p.kind !== undefined, "nothing to edit"),
  z.object({ action: z.literal("approve") }).strict(),
  z.object({ action: z.literal("reject") }).strict(),
  z.object({ action: z.literal("archive") }).strict(),
  z.object({ action: z.literal("restore") }).strict(),
  z.object({ action: z.literal("pin"), pinned: z.boolean() }).strict(),
]);
export type MemoryPatch = z.infer<typeof MemoryPatch>;
