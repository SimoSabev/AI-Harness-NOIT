import { appendFile, readFile, stat, writeFile } from "node:fs/promises";
import { shannonEntropy } from "./entropy.js";
import {
  CANDIDATE_ALLOWLIST,
  EMBEDDED_ID,
  ENV_ASSIGNMENT,
  ENTROPY_CANDIDATE,
  ENTROPY_MIN_LENGTH,
  ENTROPY_THRESHOLD,
  PREFIX_RULES,
  SEGMENT_ALLOWLIST,
  placeholder,
} from "./patterns.js";

export type Hits = Record<string, number>;

export interface Redactor {
  redactText(s: string): { text: string; hits: Hits };
  redactJson(v: unknown): { value: unknown; hits: Hits };
}

const bump = (hits: Hits, kind: string, n = 1): void => {
  hits[kind] = (hits[kind] ?? 0) + n;
};

function allowlisted(seg: string): boolean {
  if (SEGMENT_ALLOWLIST.some((re) => re.test(seg))) return true;
  const withoutIds = seg.replace(EMBEDDED_ID, "");
  if (withoutIds !== seg && (withoutIds === "" || /^[a-z0-9._-]+$/.test(withoutIds))) return true;
  const env = ENV_ASSIGNMENT.exec(seg);
  if (env) {
    const value = env[1] ?? "";
    return value.length < ENTROPY_MIN_LENGTH || allowlisted(value) || shannonEntropy(value) < ENTROPY_THRESHOLD;
  }
  return false;
}

function redactSegment(seg: string, hits: Hits): string {
  if (seg.length < ENTROPY_MIN_LENGTH) return seg;
  if (allowlisted(seg)) return seg;
  if (shannonEntropy(seg) < ENTROPY_THRESHOLD) return seg;
  bump(hits, "entropy");
  return placeholder("entropy");
}

/** Redaction rules (8.4): exact values → prefix regexes → entropy per segment. Idempotent. */
export function createRedactor(o: { exactSecrets: string[] }): Redactor {
  // Longest first, so a secret that contains another one is replaced whole.
  const exact = [...new Set(o.exactSecrets.filter((s) => s.length > 0))].sort((a, b) => b.length - a.length);

  const redactText = (input: string): { text: string; hits: Hits } => {
    const hits: Hits = {};
    let text = input;
    for (const secret of exact) {
      const parts = text.split(secret);
      if (parts.length > 1) {
        bump(hits, "exact", parts.length - 1);
        text = parts.join(placeholder("exact"));
      }
    }
    for (const rule of PREFIX_RULES) {
      text = text.replace(rule.re, () => {
        bump(hits, rule.kind);
        return placeholder(rule.kind);
      });
    }
    text = text.replace(ENTROPY_CANDIDATE, (cand) => {
      if (CANDIDATE_ALLOWLIST.some((re) => re.test(cand))) return cand;
      return cand
        .split("/")
        .map((seg) => redactSegment(seg, hits))
        .join("/");
    });
    return { text, hits };
  };

  const redactJson = (v: unknown): { value: unknown; hits: Hits } => {
    const hits: Hits = {};
    const merge = (h: Hits): void => {
      for (const [k, n] of Object.entries(h)) bump(hits, k, n);
    };
    const walk = (x: unknown): unknown => {
      if (typeof x === "string") {
        const r = redactText(x);
        merge(r.hits);
        return r.text;
      }
      if (Array.isArray(x)) return x.map(walk);
      if (x !== null && typeof x === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(x)) out[walk(k) as string] = walk(val);
        return out;
      }
      return x;
    };
    return { value: walk(v), hits };
  };

  return { redactText, redactJson };
}

const truncationMarker = (maxBytes: number): string => `[truncated at ${maxBytes} bytes]\n`;

async function currentSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function endsWith(path: string, suffix: string): Promise<boolean> {
  try {
    const buf = await readFile(path);
    return buf.subarray(Math.max(0, buf.length - Buffer.byteLength(suffix))).toString("utf8") === suffix;
  } catch {
    return false;
  }
}

/**
 * The single helper for writing text/logs to disk (D-031, 11). Objects become JSON (JSONL with append).
 * With maxBytes (D-136): a write that would exceed the cap is dropped, a truncation line is added once,
 * and every later write to that file is dropped. Never throws because of the cap; hits cover dropped content too.
 */
export async function writeRedacted(
  path: string,
  content: string | object,
  r: Redactor,
  o: { append?: boolean; maxBytes?: number } = {},
): Promise<{ hits: Hits }> {
  let text: string;
  let hits: Hits;
  if (typeof content === "string") {
    ({ text, hits } = r.redactText(content));
  } else {
    const red = r.redactJson(content);
    hits = red.hits;
    text = o.append ? JSON.stringify(red.value) + "\n" : JSON.stringify(red.value, null, 2) + "\n";
  }
  const append = o.append === true;
  if (o.maxBytes !== undefined) {
    const marker = truncationMarker(o.maxBytes);
    const existing = append ? await currentSize(path) : 0;
    if (append && (await endsWith(path, marker))) return { hits };
    if (existing + Buffer.byteLength(text) > o.maxBytes) {
      if (append) await appendFile(path, marker);
      else await writeFile(path, marker);
      return { hits };
    }
  }
  if (append) await appendFile(path, text);
  else await writeFile(path, text);
  return { hits };
}
