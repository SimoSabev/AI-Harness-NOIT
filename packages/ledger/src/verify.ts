import { z } from "zod";
import { LedgerEntry, jcs, sha256Tag } from "@mandat/contract";
import type { Sha256 } from "@mandat/contract";

export type VerifyCode = "E_PARSE" | "E_SCHEMA" | "E_ORG" | "E_SEQ_GAP" | "E_PREV_HASH" | "E_HASH";
export type VerifyResult =
  | { ok: true; count: number; lastHash: Sha256 | null }
  | {
      ok: false;
      countOk: number;
      firstBadSeq: number | null;
      line: number;
      code: VerifyCode;
      message: string;
      expected?: string;
      actual?: string;
    };

// D-107: org_id is a plain string here so a foreign org reaches E_ORG instead of failing as E_SCHEMA.
const LedgerEntryAnyOrg = LedgerEntry.extend({ org_id: z.string() }).strict();

/** Stops at the first broken line. firstBadSeq is the EXPECTED seq (= line number), not the recorded one (D-064). */
export function verifyLedger(lines: string[], opts: { org?: "o_local" } = {}): VerifyResult {
  const org = opts.org ?? "o_local";
  const rows = lines.length > 0 && lines.at(-1) === "" ? lines.slice(0, -1) : lines; // D-128
  let prevHash: string | null = null;
  for (let i = 0; i < rows.length; i++) {
    const line = i + 1;
    const bad = (code: VerifyCode, message: string, expected?: string, actual?: string): VerifyResult => ({
      ok: false,
      countOk: i,
      firstBadSeq: line,
      line,
      code,
      message,
      ...(expected !== undefined ? { expected } : {}),
      ...(actual !== undefined ? { actual } : {}),
    });
    let json: unknown;
    try {
      json = JSON.parse(rows[i] ?? "");
    } catch {
      return bad("E_PARSE", "invalid JSON");
    }
    const parsed = LedgerEntryAnyOrg.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return bad("E_SCHEMA", issue ? `${issue.path.join(".") || "(root)"}: ${issue.message}` : "schema mismatch");
    }
    const e = parsed.data;
    if (e.org_id !== org) return bad("E_ORG", "foreign org_id", org, e.org_id);
    if (e.seq !== line) return bad("E_SEQ_GAP", "seq does not follow the previous line", String(line), String(e.seq));
    if (e.prev_hash !== prevHash) {
      return bad("E_PREV_HASH", "prev_hash does not match the previous line", String(prevHash), String(e.prev_hash));
    }
    const { hash, ...body } = e;
    const computed = sha256Tag(jcs(body));
    if (computed !== hash) return bad("E_HASH", "hash does not match the line", computed, hash);
    prevHash = hash;
  }
  return { ok: true, count: rows.length, lastHash: prevHash };
}
