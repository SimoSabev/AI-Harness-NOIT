import type { Key, T } from "../../i18n/t";

// Browser side of the internal API: the CSRF double-submit header from the mandat_csrf cookie.
export function csrfToken(): string {
  const m = /(?:^|;\s*)mandat_csrf=([^;]+)/.exec(typeof document === "undefined" ? "" : document.cookie);
  return m ? decodeURIComponent(m[1] ?? "") : "";
}

export async function postJson(url: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(url, { method, headers: { "content-type": "application/json", "x-mandat-csrf": csrfToken() }, body: JSON.stringify(body), credentials: "same-origin" });
  const parsed = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: r.status, body: parsed };
}

/** The API error codes a person may see → catalog keys (E7f); unknown codes fall back to "Error (status)". */
export const ERROR_TEXT: Record<string, Key> = {
  head_sha_moved: "error.head_sha_moved",
  already_approved: "error.already_approved",
  second_factor_required: "error.second_factor_required",
  second_factor_invalid: "error.second_factor_invalid",
  second_factor_rejected: "error.second_factor_rejected",
  not_an_approver: "error.not_an_approver",
  not_retryable: "error.not_retryable",
  no_attempts_left: "error.no_attempts_left",
  no_repo_for_type: "error.no_repo_for_type",
  not_stoppable: "error.not_stoppable",
  rate_limited: "error.rate_limited",
};

export function errorText(t: T, r: { status: number; body: Record<string, unknown> }, extra: Record<string, Key> = {}, fallback?: string): string {
  const code = String(r.body.error);
  const key = extra[code] ?? ERROR_TEXT[code];
  return key ? t(key) : (fallback ?? t("error.generic", { status: r.status }));
}
