import type { MemoryBasis, MemorySource, MemoryStatus } from "@mandat/contract";
import { createRedactor } from "@mandat/redaction";

// D-400: who may write what. The control is at the write (OWASP ASI06): a scanner, then a status by the trust of the
// source. Rules and permissions never become memory — they stay proposals with approval (PRD-9).

export type ScanReason = "invisible" | "secret" | "injection" | "rule";
export type ScanResult = { ok: true } | { ok: false; reason: ScanReason };

const INVISIBLE = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]/u;
const INJECTION: readonly RegExp[] = [
  /\b(ignore|disregard|forget)\b.{0,30}\b(previous|prior|above|earlier|all|your)\b.{0,20}\b(instructions?|rules?|prompts?)\b/i,
  /(игнорирай|пренебрегни|забрави).{0,30}(предишни|горни|всички|твоите).{0,20}(инструкци|правил|указани)/i,
  /\byou are now\b|\bact as (an? )?(admin|root|developer mode)|\bdeveloper mode\b|\bjailbreak\b/i,
  /<\/?\s*(system|assistant|user|instructions?)\s*>/i,
  /\b(system prompt|системния промпт)\b/i,
  /\b(curl|wget|fetch)\b[^\n]{0,80}https?:\/\/[^\n]{0,120}(\|\s*(ba|z)?sh\b)/i,
  /(\.ssh\/|authorized_keys|id_rsa|id_ed25519)/i,
  /base64\s+(-d|--decode)\b[^\n]{0,40}\|\s*(ba|z)?sh\b/i,
  /\b(send|post|upload|exfiltrate|изпрати)\b.{0,40}\b(key|token|secret|ключ|токен|тайн)/i,
];
const RULE: readonly RegExp[] = [
  /\b(allow|deny|permit|grant)\b.{0,40}\b(agent|write|access|tool|permission|path)/i,
  /(позволи|разреши|забрани|дай права|дай достъп)/i,
  /\b(skip|disable|bypass|turn off)\b.{0,20}\b(tests?|checks?|verification|review|approval|gate|ci)\b/i,
  /(без|пропусни|изключи).{0,10}(тестове|тестовете|проверк|одобрени|преглед)/i,
  /\bauto-?merge\b|автоматично сливане/i,
  /\bprotected_paths?\b|\bpermissions?\b|\bsudo\b|--dangerously|--privileged|--cap-add|docker\.sock/i,
];

/** The scanner every memory goes through before it is stored (also on edit). */
export function scanMemory(text: string, exactSecrets: readonly string[] = []): ScanResult {
  if (INVISIBLE.test(text)) return { ok: false, reason: "invisible" };
  const r = createRedactor({ exactSecrets: [...exactSecrets] }).redactText(text);
  if (Object.keys(r.hits).length > 0) return { ok: false, reason: "secret" };
  if (INJECTION.some((re) => re.test(text))) return { ok: false, reason: "injection" };
  if (RULE.some((re) => re.test(text))) return { ok: false, reason: "rule" };
  return { ok: true };
}

/** The status of a new memory by its source and the agent's ground (table 4.2 of docs/prd/research/memory.md). */
export function initialStatus(source: MemorySource, basis: MemoryBasis | null): Extract<MemoryStatus, "active" | "pending"> {
  if (source === "human" || source === "chat" || source === "consolidation") return "active";
  if (source === "agent_session" && basis === "user_said") return "active";
  return "pending";
}

function prefixed(text: string, re: RegExp, max: number): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const v = re.exec(line)?.[1]?.trim();
    if (v && out.length < max) out.push(v);
  }
  return out;
}

/** "запомни: …" / "remember: …" lines of a task text: the person's own words, so they become active memories. */
export function rememberLines(text: string): string[] {
  return prefixed(text, /^\s*(?:запомни|remember)\s*:\s*(.*)$/iu, 20);
}

/** "MEMORY: …" lines an agent in the sandbox left in /m/out/notes.txt: proposals that wait for a person (at most 10). */
export function memoryFromNotes(notes: string): string[] {
  return prefixed(notes, /^\s*(?:MEMORY|ПАМЕТ)\s*:\s*(.*)$/u, 10);
}

/** What the memory block tells an agent about suggesting a memory (the sandbox has no memory tool). */
export const NOTES_HINT = "To suggest a memory for later tasks, write a line `MEMORY: <one fact>` into /m/out/notes.txt; a person approves it.";
