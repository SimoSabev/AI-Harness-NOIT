import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { MandatError } from "@mandat/contract";
import { readLedgerOnline, requestAnchor } from "@mandat/ledger";
import type { Fetcher, SqlClient } from "@mandat/ledger";
import { printJson, shortHash } from "../output.js";
import type { Io } from "../output.js";

/** т. 5.4: `mandat anchor [--org <uuid>]` — RFC 3161 timestamp of the last ledger hash (TSA_URLS, comma separated). */
export async function anchorCommand(io: Io, o: { home: string; org: string; json: boolean; db?: SqlClient & { end?: () => Promise<void> }; fetcher?: Fetcher }): Promise<number> {
  const urls = (io.env.TSA_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (urls.length === 0) throw new MandatError("E_USAGE", "TSA_URLS is empty (docs/setup/tsa.md)");
  let last: { seq: number; hash: string } | null = null;
  if (o.org === "o_local") {
    const f = path.join(o.home, "ledger.jsonl");
    const lines = existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean) : [];
    const l = lines.at(-1);
    if (l) {
      const e = JSON.parse(l) as { seq: number; hash: string };
      last = { seq: e.seq, hash: e.hash };
    }
  } else if (o.db) {
    const rows = await readLedgerOnline(o.db, o.org);
    const l = rows.at(-1);
    if (l) last = { seq: Number(l.seq), hash: l.hash };
  }
  if (!last) {
    io.stderr("anchor: the ledger is empty\n");
    return 3;
  }
  const r = await requestAnchor({ lastHash: last.hash, urls, ...(o.fetcher ? { fetcher: o.fetcher } : {}) });
  if (!r.ok) {
    io.stderr(`anchor: no TSA answered with a valid token: ${r.errors.join("; ")}\n`);
    await o.db?.end?.();
    return 3;
  }
  const row = { org_id: o.org, seq_to: last.seq, root_hash: last.hash, tsa_url: r.url, gen_time: r.genTime.toISOString(), tsr_b64: Buffer.from(r.tsr).toString("base64") };
  if (o.org === "o_local") appendFileSync(path.join(o.home, "anchors.jsonl"), JSON.stringify(row) + "\n");
  else if (o.db) {
    await o.db.query("insert into public.anchors (org_id, seq_from, seq_to, root_hash, tsa_url, tsr, gen_time) values ($1::uuid, 1, $2, $3, $4, decode($5, 'base64'), $6)", [o.org, last.seq, last.hash, r.url, row.tsr_b64, row.gen_time]);
    await o.db.end?.();
  }
  if (o.json) printJson(io, { ...row, tsr_b64: undefined, exit: 0 });
  else io.stdout(`anchored seq ${last.seq} (${shortHash(last.hash)}) at ${row.gen_time} by ${r.url}\n`);
  return 0;
}
