import { z } from "zod";
import { TaskType } from "@mandat/contract";

// Демо промпт т. 7.3: one JSON line request → one JSON line response over the verifyd Unix socket. Only these ops.
export const JobId = z.string().regex(/^j_[0-9A-HJKMNP-TV-Z]{26}$/);
export const VerifydRequest = z.discriminatedUnion("op", [
  // D-281: no `remote` from the client — verifyd pins the base from ITS OWN --allow/--remote config
  z.object({ op: z.literal("verify"), repo: z.string().min(1).max(4096), task_type: TaskType.nullable() }).strict(),
  z.object({ op: z.literal("status"), job_id: JobId }).strict(),
  z.object({ op: z.literal("explain"), job_id: JobId, lang: z.enum(["bg", "en"]).default("en") }).strict(),
]);
export type VerifydRequest = z.infer<typeof VerifydRequest>;
export const JobStatus = z
  .object({
    job_id: JobId,
    status: z.enum(["running", "done", "error"]),
    result: z.enum(["VERIFIED", "FAILED", "UNKNOWN"]).optional(),
    reasons: z.array(z.string()).optional(),
    effective_level: z.union([z.literal(0), z.literal(1)]).optional(),
    level_reasons: z.array(z.string()).optional(),
    ledger_seq: z.number().int().nullable().optional(),
    elapsed_s: z.number(),
    error: z.string().optional(),
  })
  .strict();
export type JobStatus = z.infer<typeof JobStatus>;
export type VerifydResponse = { ok: true; job_id: string; status: "running"; poll_after_s: number } | { ok: true; status: JobStatus } | { ok: true; text: string } | { ok: false; error: string };
