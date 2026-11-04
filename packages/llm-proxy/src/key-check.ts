import type { ApiFormat, AuthStyle, KeyCheck } from "@mandat/contract";

// D-472: "Check the key" — one 1-token request in the provider's own format (the cheapest call that also shows a missing
// credit, which a models list does not), four plain results. It runs where the sealed key lives (the process that owns
// the proxy); the key goes in the provider's header only, never in a URL, a log line or the result.

const TIMEOUT_MS = 15_000;
const BODY_LIMIT = 4096;

export interface CheckTarget { wire: ApiFormat; base: string; auth: AuthStyle; key: string; model: string }

function authHeaders(auth: AuthStyle, key: string): Record<string, string> {
  if (key === "") return {};
  if (auth === "x-api-key") return { "x-api-key": key };
  if (auth === "bearer") return { authorization: `Bearer ${key}` };
  if (auth === "x-goog-api-key") return { "x-goog-api-key": key };
  if (auth === "api-key") return { "api-key": key };
  return {};
}

function request(t: CheckTarget): { url: string; init: RequestInit } {
  const base = t.base.replace(/\/+$/, "");
  const json = { ...authHeaders(t.auth, t.key), "content-type": "application/json" };
  const post = (path: string, body: unknown, extra: Record<string, string> = {}) => ({ url: `${base}${path}`, init: { method: "POST", headers: { ...json, ...extra }, body: JSON.stringify(body) } });
  // a server on this computer has no key and no credit: is it there? (a 1-token message would load a big model)
  if (t.auth === "none") return { url: `${base}/v1/models`, init: { method: "GET", headers: {} } };
  switch (t.wire) {
    case "anthropic":
      return post("/v1/messages", { model: t.model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }, { "anthropic-version": "2023-06-01" });
    case "openai":
      return post("/v1/responses", { model: t.model, input: "ping", max_output_tokens: 16 });
    case "openai-chat":
      return post("/v1/chat/completions", { model: t.model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] });
    case "gemini":
      return post(`/v1beta/models/${encodeURIComponent(t.model)}:generateContent`, { contents: [{ parts: [{ text: "ping" }] }], generationConfig: { maxOutputTokens: 1 } });
    case "native":
      return { url: `${base}/v1/models`, init: { method: "GET", headers: authHeaders(t.auth, t.key) } };
  }
}

const NO_CREDIT = /insufficient[_ ]?(quota|balance|funds|credit)|credit balance|out of credit|no credit|billing|payment required|balance is (too )?low|exceeded your current quota|arrears|欠费|余额/i;
const BAD_KEY = /api[_ -]?key[_ ]?(invalid|not valid|is invalid)|invalid[_ ]?(api[_ ]?)?key|invalid x-api-key|incorrect api key|unauthori[sz]ed|authentication|API_KEY_INVALID/i;

/** The result of one check reply (status + at most the first 4 KB of its body). */
export function classifyCheck(status: number, body: string): KeyCheck {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401 || status === 403) return "bad_key";
  if (status === 402) return "no_credit";
  if (status === 429) return NO_CREDIT.test(body) ? "no_credit" : "ok";
  if (status === 400 || status === 422) return NO_CREDIT.test(body) ? "no_credit" : BAD_KEY.test(body) ? "bad_key" : "ok";
  if (status === 404) return /model/i.test(body) && body.trimStart().startsWith("{") ? "ok" : "unreachable";
  return "unreachable";
}

export async function checkKey(f: typeof fetch, t: CheckTarget, timeoutMs = TIMEOUT_MS): Promise<KeyCheck> {
  const { url, init } = request(t);
  try {
    const r = await f(url, { ...init, signal: AbortSignal.timeout(timeoutMs), redirect: "error" });
    const body = (await r.text().catch(() => "")).slice(0, BODY_LIMIT);
    if (t.auth === "none") return r.status < 500 ? "ok" : "unreachable";
    return classifyCheck(r.status, body);
  } catch {
    return "unreachable";
  }
}
