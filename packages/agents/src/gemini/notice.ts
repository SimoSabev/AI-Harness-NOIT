import type { ProviderNotice, ProviderProblem } from "@mandat/contract";

// D-446: Gemini CLI's retry lines on stderr → a typed code. Only the attempt number and the code leave this function, never
// the line. Shapes seen in a real run of CLI 0.65.0 (r_01M6DNMT6P4ZVBWX622FMVMSK5, 2.11.2026):
//   Attempt 1 failed with status 503. Retrying with backoff... _ApiError: …
//   Attempt 2 failed. Retrying with backoff... Error: exception TypeError: fetch failed sending request
//   Attempt 10 failed: <message>    (the last one; the CLI stops there)
// [НП] that 10 is a fixed limit of the CLI: it is what that run did; the source of the limit was not read.
const MAX_ATTEMPTS = 10;
const LINE = /^Attempt (\d{1,3}) failed(?: with status (\d{3}))?[.:]?(.*)$/;

function byStatus(status: number): ProviderProblem {
  if (status === 503 || status === 529) return "overloaded";
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "key_rejected";
  if (status === 408 || status === 504) return "timed_out";
  return "unknown";
}
function byWords(rest: string): ProviderProblem {
  if (/fetch failed|timed? ?out|ETIMEDOUT|UND_ERR/i.test(rest)) return "timed_out";
  if (/high demand|overloaded/i.test(rest)) return "overloaded";
  if (/quota|rate limit|too many requests|RESOURCE_EXHAUSTED/i.test(rest)) return "rate_limited";
  if (/api key|permission denied|unauthori[sz]ed/i.test(rest)) return "key_rejected";
  return "unknown";
}

export function geminiProviderNotice(line: string): ProviderNotice | null {
  const m = LINE.exec(line);
  if (!m) return null;
  const attempt = Number(m[1]);
  if (attempt < 1) return null;
  return { problem: m[2] !== undefined ? byStatus(Number(m[2])) : byWords(m[3] ?? ""), attempt, max: MAX_ATTEMPTS };
}
