import { z } from "zod";
import { Sha256 } from "./schemas.js";

// v5 2.5 / D-324 / PRD 6.13: research as a harness service. A quote is an exact substring of the pinned source text;
// a URL may be cited only if it came out of a tool result.
export const ResearchScope = z.enum(["web", "docs", "code", "papers", "internal"]);
export type ResearchScope = z.infer<typeof ResearchScope>;
export const ResearchDepth = z.enum(["quick", "standard", "deep"]);
export type ResearchDepth = z.infer<typeof ResearchDepth>;
const HttpUrl = z
  .string()
  .max(2000)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), { message: "http(s) only" });
export const SourceId = z.string().regex(/^src_[a-z0-9_]{1,40}$/);
export const SourceRecord = z
  .object({
    id: SourceId,
    provider: z.string().min(1).max(64),
    url: HttpUrl,
    final_url: HttpUrl,
    title: z.string().max(300),
    content_hash: Sha256,
    fetched_at: z.string().datetime(),
    archived_url: HttpUrl.nullable(),
    archive_digest: z.string().max(100).nullable(),
    state: z.enum(["read", "weak", "failed", "too_large", "blocked"]),
  })
  .strict();
export type SourceRecord = z.infer<typeof SourceRecord>;
export const Quote = z
  .object({ source_id: SourceId, offset: z.number().int().min(0), length: z.number().int().min(1).max(2000), text: z.string().min(1).max(2000) })
  .strict()
  .refine((q) => q.text.length === q.length, { message: "length must equal text length" });
export type Quote = z.infer<typeof Quote>;
export const ClaimVerdict = z.enum(["confirmed", "single", "conflict", "unchecked", "quote_missing"]);
export type ClaimVerdict = z.infer<typeof ClaimVerdict>;
export const Claim = z
  .object({ text: z.string().min(1).max(2000), verdict: ClaimVerdict, quote_ids: z.array(z.number().int().min(0)).max(50), as_of: z.string().datetime().nullable() })
  .strict()
  .refine((c) => !(["confirmed", "single", "conflict"] as const).includes(c.verdict as "confirmed") || c.quote_ids.length > 0, { message: "a supported verdict needs a quote" });
export type Claim = z.infer<typeof Claim>;
export const ResearchResult = z
  .object({
    question: z.string().min(1).max(2000),
    depth: ResearchDepth,
    claims: z.array(Claim).max(200),
    synthesis: z.string().max(20_000),
    unresolved: z.array(z.string().max(500)).max(50),
    cost_usd: z.number().min(0),
    /** null = complete; otherwise why it stopped early (e.g. "budget") */
    partial: z.enum(["budget", "timeout", "providers_down"]).nullable(),
  })
  .strict();
export type ResearchResult = z.infer<typeof ResearchResult>;

export const RESEARCH_TOOLS = ["research_search", "research_read", "research_docs", "research_code", "research_ask", "research_verify", "research_recall"] as const;
export type ResearchTool = (typeof RESEARCH_TOOLS)[number];
const Q = z.string().min(1).max(2000);
export const ResearchToolInput = {
  research_search: z.object({ query: Q, scope: ResearchScope, recency: z.enum(["any", "year", "month", "week"]).default("any"), domains: z.array(z.string().max(253)).max(20).optional(), max: z.number().int().min(1).max(20).default(8) }).strict(),
  research_read: z
    .object({ source_id: SourceId.optional(), url: HttpUrl.optional(), question: Q.optional() })
    .strict()
    .refine((x) => (x.source_id === undefined) !== (x.url === undefined), { message: "exactly one of source_id or url" }),
  research_docs: z.object({ library: z.string().min(1).max(200), version: z.string().max(64).optional(), topic: Q }).strict(),
  research_code: z.object({ query: Q, repo: z.string().max(200).optional() }).strict(),
  research_ask: z.object({ question: Q, depth: ResearchDepth.default("standard"), budget_usd: z.number().positive().max(20).optional(), repo: z.string().max(200).optional() }).strict(),
  research_verify: z
    .object({ claims: z.array(z.object({ text: Q, source_ids: z.array(SourceId).max(20).default([]), urls: z.array(HttpUrl).max(20).default([]), quote: z.string().max(2000).optional() }).strict()).min(1).max(50) })
    .strict(),
  research_recall: z.object({ question: Q.optional(), topic: z.string().max(200).optional(), repo: z.string().max(200) }).strict(),
} satisfies Record<ResearchTool, z.ZodType>;
export const SearchHit = z.object({ source_id: SourceId, url: HttpUrl, title: z.string().max(300), snippet: z.string().max(1000), date: z.string().max(40).nullable(), provider: z.string().max(64) }).strict();
export type SearchHit = z.infer<typeof SearchHit>;
