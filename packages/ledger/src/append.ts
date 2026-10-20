import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import path from "node:path";
import { LedgerEntry, SecurityEvent, TaskId, hashJcs, jcs, sha256Tag, ulid } from "@mandat/contract";
import type { LedgerKind } from "@mandat/contract";
import type { Redactor } from "@mandat/redaction";

function appendLine(file: string, line: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const fd = openSync(file, "a");
  try {
    writeSync(fd, line);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function lastEntry(file: string): LedgerEntry | null {
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, "utf8").split("\n").filter((l) => l.length > 0);
  const last = lines.at(-1);
  if (last === undefined) return null;
  const parsed = LedgerEntry.safeParse(JSON.parse(last));
  if (!parsed.success) throw new Error(`ledger tail is not a valid entry: ${file}`);
  return parsed.data;
}

/**
 * Appends one entry (fsync). The payload is ALREADY redacted by the caller (D-075, D-106); this function only
 * hashes it. It takes no lock: the worker holds run.lock. ledger-payloads.jsonl is written by the caller.
 */
export function appendLedger(
  file: string,
  input: { kind: LedgerKind; task_id: string | null; payload: unknown },
  now: Date = new Date(),
): LedgerEntry {
  const prev = lastEntry(file);
  const body = {
    org_id: "o_local" as const,
    seq: prev === null ? 1 : prev.seq + 1,
    ts: now.toISOString(),
    kind: input.kind,
    task_id: TaskId.nullable().parse(input.task_id),
    payload_hash: input.payload === null ? null : hashJcs(input.payload),
    prev_hash: prev === null ? null : prev.hash,
  };
  const entry = LedgerEntry.parse({ ...body, hash: sha256Tag(jcs(body)) });
  appendLine(file, JSON.stringify(entry) + "\n");
  return entry;
}

/**
 * Writes a SecurityEvent (detail redacted here) to <home>/security_events.jsonl. warn|incident also become a
 * security_event ledger row whose payload goes to <home>/runs/<run_id>/ledger-payloads.jsonl (D-042, D-106).
 */
export function appendSecurityEvent(o: {
  home: string;
  ev: Omit<SecurityEvent, "id" | "created_at" | "org_id">;
  r: Redactor;
  now?: Date;
}): { event: SecurityEvent; ledger: LedgerEntry | null } {
  const now = o.now ?? new Date();
  const detail = o.r.redactJson(o.ev.detail).value;
  const event = SecurityEvent.parse({
    id: "se_" + ulid(now.getTime()),
    org_id: "o_local",
    ...o.ev,
    detail,
    created_at: now.toISOString(),
  });
  appendLine(path.join(o.home, "security_events.jsonl"), JSON.stringify(event) + "\n");
  if (event.severity === "info") return { event, ledger: null };
  const payload = { kind: event.kind, run_id: event.run_id, detail_hash: hashJcs(event.detail) };
  const ledger = appendLedger(path.join(o.home, "ledger.jsonl"), { kind: "security_event", task_id: event.task_id, payload }, now);
  if (event.run_id !== null) {
    appendLine(path.join(o.home, "runs", event.run_id, "ledger-payloads.jsonl"), JSON.stringify({ seq: ledger.seq, payload }) + "\n");
  }
  return { event, ledger };
}
