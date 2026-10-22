import { z } from "zod";

// E8к (v5 т. 4.10 (5)): the golden set of the research spike (fixtures/research/golden.json).
export const GoldenQuestion = z
  .object({
    id: z.string().regex(/^[PG]\d{2}$/),
    kind: z.enum(["project", "general"]),
    question: z.string().min(1).max(500),
    /** accepted answers; a reply counts when it contains one of them after normalization */
    answers: z.array(z.string().min(1).max(200)).min(1),
    /** project: a path under fixtures/; general: an https URL */
    source: z.string().max(500),
  })
  .strict()
  .refine((q) => (q.kind === "project" ? /^fixtures\/[\w./-]+$/.test(q.source) && !q.source.split("/").includes("..") : /^https:\/\/\S+$/.test(q.source)), { message: "source does not match the kind" });
export type GoldenQuestion = z.infer<typeof GoldenQuestion>;
export const GoldenSet = z.object({ version: z.literal(1), note: z.string().optional(), questions: z.array(GoldenQuestion).min(1) }).strict();
export type GoldenSet = z.infer<typeof GoldenSet>;
