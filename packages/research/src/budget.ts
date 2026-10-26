import type { DepthBudget, PartialReason } from "@mandat/contract";

// E9г (AC-13.7): the run stops searching once a cap is reached and returns what it has, labelled "partial: budget".
// The writer always gets a reserve so a stopped run still ends with a report.

export class Budget {
  usd = 0;
  pages = 0;
  queries = 0;
  inputTokens = 0;
  outputTokens = 0;
  private stopped: PartialReason | null = null;
  /** the share of the money kept for the writer */
  static readonly WRITER_RESERVE = 0.2;
  constructor(readonly cap: DepthBudget, private readonly deadline: number, private readonly now: () => number = Date.now) {}

  spend(usd: number, inTok = 0, outTok = 0): void {
    this.usd += usd;
    this.inputTokens += inTok;
    this.outputTokens += outTok;
  }
  stop(why: PartialReason): void {
    this.stopped ??= why;
  }
  /** why gathering must stop now, or null */
  exhausted(): PartialReason | null {
    if (this.stopped) return this.stopped;
    if (this.now() >= this.deadline) return "timeout";
    if (this.overCap()) return "budget";
    return null;
  }
  private overCap(): boolean {
    const keep = 1 - Budget.WRITER_RESERVE;
    return this.usd >= this.cap.usd * keep || this.inputTokens + this.outputTokens >= this.cap.tokens * keep;
  }
  /** the run went over a cap at some point (the report is partial) */
  get reason(): PartialReason | null {
    return this.stopped ?? (this.now() >= this.deadline ? "timeout" : this.overCap() ? "budget" : null);
  }
  canQuery(): boolean {
    return this.exhausted() === null && this.queries < this.cap.queries;
  }
  canRead(): boolean {
    return this.exhausted() === null && this.pages < this.cap.pages;
  }
  query(): void {
    this.queries++;
  }
  page(): void {
    this.pages++;
  }
}
