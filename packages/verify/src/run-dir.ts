import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hashJcs } from "@mandat/contract";
import type { LedgerEntry, LedgerKind, SecurityEvent } from "@mandat/contract";
import { appendLedger, appendSecurityEvent } from "@mandat/ledger";
import { writeRedacted } from "@mandat/redaction";
import type { Hits, Redactor } from "@mandat/redaction";

/** Run-scoped writer: everything textual goes through writeRedacted; hits are summed for one redaction_hit (D-042). */
export class RunWriter {
  readonly hits: Hits = {};
  ledgerFrom: number | null = null;
  ledgerTo: number | null = null;

  constructor(
    readonly home: string,
    readonly runDir: string,
    readonly r: Redactor,
    readonly now: () => Date,
  ) {
    mkdirSync(runDir, { recursive: true });
  }

  private add(h: Hits): void {
    for (const [k, n] of Object.entries(h)) this.hits[k] = (this.hits[k] ?? 0) + n;
  }

  async text(rel: string, content: string | object, o: { append?: boolean; maxBytes?: number } = {}): Promise<void> {
    const f = path.join(this.runDir, rel);
    mkdirSync(path.dirname(f), { recursive: true });
    this.add((await writeRedacted(f, content, this.r, o)).hits);
  }

  /** Bytes under a hash or copies of trees: NEVER redacted (D-031). */
  raw(rel: string, content: string | Buffer): void {
    const f = path.join(this.runDir, rel);
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, content);
  }

  private track(e: LedgerEntry): void {
    this.ledgerFrom ??= e.seq;
    this.ledgerTo = e.seq;
  }

  /** D-075 / D-106: redact → hash → write; payload row in ledger-payloads.jsonl. */
  ledger(kind: LedgerKind, taskId: string | null, payload: object): LedgerEntry {
    const red = this.r.redactJson(payload);
    this.add(red.hits);
    const e = appendLedger(path.join(this.home, "ledger.jsonl"), { kind, task_id: taskId, payload: red.value }, this.now());
    appendFileSync(path.join(this.runDir, "ledger-payloads.jsonl"), JSON.stringify({ seq: e.seq, payload: red.value }) + "\n");
    this.track(e);
    return e;
  }

  security(ev: Omit<SecurityEvent, "id" | "created_at" | "org_id">): SecurityEvent {
    const { event, ledger } = appendSecurityEvent({ home: this.home, ev, r: this.r, now: this.now() });
    if (ledger) this.track(ledger);
    return event;
  }

  hashOf(v: unknown): string {
    return hashJcs(this.r.redactJson(v).value);
  }
}
