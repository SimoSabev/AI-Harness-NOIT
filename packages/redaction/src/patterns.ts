// 8.4: prefix rules, applied in this order after exact secrets.
export interface PrefixRule {
  kind: string;
  re: RegExp;
}

// Token ends use a negative lookahead instead of \b so a value ending in "-" or "_" is still matched (D-139).
export const PREFIX_RULES: readonly PrefixRule[] = [
  { kind: "anthropic", re: /sk-ant-[A-Za-z0-9_-]{20,}/g }, // api03 / oat01 / admin01
  { kind: "openai", re: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { kind: "github", re: /\bgh[pousr]_[A-Za-z0-9]{36,}/g },
  { kind: "supabase", re: /\bsb_secret_[A-Za-z0-9_-]{20,}/g },
  { kind: "aws", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "slack", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { kind: "mandat_token", re: /\bmdt_[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g },
];

/** Entropy candidates: runs of 20+ chars; each "/"-separated segment is judged on its own (D-059). */
export const ENTROPY_CANDIDATE = /[A-Za-z0-9+/_=-]{20,}/g;
export const ENTROPY_MIN_LENGTH = 20;
export const ENTROPY_THRESHOLD = 4.5;

/** Whole-candidate allowlist (checked before splitting, because npm integrity contains "/"). */
export const CANDIDATE_ALLOWLIST: readonly RegExp[] = [/^sha512-[A-Za-z0-9+/]{86}==$/];

/** Per-segment allowlist. */
export const SEGMENT_ALLOWLIST: readonly RegExp[] = [
  /^[0-9a-f]{40}$/, // git sha
  /^[0-9a-f]{64}$/, // sha256 hex (the "sha256:" prefix is not part of the candidate)
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID
  /^(?:r|se)_[0-9A-HJKMNP-TV-Z]{26}$/, // RunId / SecurityEvent id (ULID)
  /^[a-z0-9._-]+$/, // lowercase-only segments
];

// D-140: before the per-segment checks, embedded run/event ids are ignored (Docker object names such as
// "mandat-net-r_<ULID>-agent") and "NAME=value" is judged by its value only.
export const EMBEDDED_ID = /(?:r|se)_[0-9A-HJKMNP-TV-Z]{26}/g;
export const ENV_ASSIGNMENT = /^[A-Z][A-Z0-9_]*=(.*)$/;

export const placeholder = (kind: string): string => `[REDACTED:${kind}]`;
