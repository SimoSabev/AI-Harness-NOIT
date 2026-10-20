import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hashJcs, jcs, sha256Tag, ulid } from "@mandat/contract";
import { createRedactor } from "@mandat/redaction";
import { appendLedger, appendSecurityEvent, verifyLedger } from "./index.js";

const fx = (name: string): string[] =>
  readFileSync(new URL(`../../../fixtures/ledger/${name}`, import.meta.url), "utf8").split("\n");
const tmp = (): string => mkdtempSync(path.join(tmpdir(), "mandat-ledger-"));
const T0 = new Date("2026-10-20T10:00:00.000Z");

function chain(n: number): string[] {
  const f = path.join(tmp(), "ledger.jsonl");
  for (let i = 0; i < n; i++) {
    appendLedger(f, { kind: i % 2 ? "verdict" : "task_created", task_id: "t_fix_discount", payload: { i } }, new Date(T0.getTime() + i));
  }
  return readFileSync(f, "utf8").split("\n");
}

describe("appendLedger", () => {
  it("append на празен файл", () => {
    const f = path.join(tmp(), "ledger.jsonl");
    const e = appendLedger(f, { kind: "task_created", task_id: "t_fix_discount", payload: { run_id: "r_x" } }, T0);
    expect(e.seq).toBe(1);
    expect(e.prev_hash).toBeNull();
    expect(e.ts).toBe("2026-10-20T10:00:00.000Z");
    const { hash, ...rest } = e;
    expect(hash).toBe(sha256Tag(jcs(rest)));
    expect(readFileSync(f, "utf8")).toBe(JSON.stringify(e) + "\n");
  });

  it("append верига", () => {
    const f = path.join(tmp(), "ledger.jsonl");
    const es = [1, 2, 3].map((i) => appendLedger(f, { kind: "verdict", task_id: null, payload: null }, new Date(T0.getTime() + i)));
    expect(es.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(es[1]?.prev_hash).toBe(es[0]?.hash);
    expect(es[2]?.prev_hash).toBe(es[1]?.hash);
    expect(es[0]?.payload_hash).toBeNull();
  });

  it("appendLedger хешира подадения обект (D-106)", () => {
    const dir = tmp();
    const f = path.join(dir, "ledger.jsonl");
    const e = appendLedger(f, { kind: "task_created", task_id: "t_a", payload: { a: "x" } });
    expect(e.payload_hash).toBe(hashJcs({ a: "x" }));
    expect(existsSync(path.join(dir, "run.lock"))).toBe(false);
    expect(existsSync(path.join(dir, "ledger-payloads.jsonl"))).toBe(false);
  });

  it("отказва невалиден task_id", () => {
    expect(() => appendLedger(path.join(tmp(), "l.jsonl"), { kind: "verdict", task_id: "bad id", payload: null })).toThrow();
  });
});

describe("verifyLedger", () => {
  it("verify ok", () => {
    const r = verifyLedger(fx("ok.jsonl"));
    expect(r).toMatchObject({ ok: true, count: 5 });
  });

  it("verify хваща подмяна на ts", () => {
    expect(verifyLedger(fx("tampered.jsonl"))).toMatchObject({ ok: false, firstBadSeq: 3, line: 3, code: "E_HASH", countOk: 2 });
  });

  it("verify хваща изтрит ред", () => {
    const lines = fx("ok.jsonl");
    lines.splice(1, 1);
    expect(verifyLedger(lines)).toEqual({
      ok: false,
      code: "E_SEQ_GAP",
      firstBadSeq: 2,
      line: 2,
      countOk: 1,
      expected: "2",
      actual: "3",
      message: expect.any(String) as string,
    });
  });

  it("verify хваща пренаписана опашка", () => {
    const lines = fx("ok.jsonl");
    const e = JSON.parse(lines[2] ?? "") as Record<string, unknown>;
    e.ts = "2026-01-01T00:00:00.000Z";
    const { hash: _h, ...rest } = e;
    e.hash = sha256Tag(jcs(rest));
    lines[2] = JSON.stringify(e);
    expect(verifyLedger(lines)).toMatchObject({ ok: false, code: "E_PREV_HASH", firstBadSeq: 4, line: 4, countOk: 3 });
  });

  it("verify: невалиден JSON, чужд org", () => {
    const lines = fx("ok.jsonl");
    lines[1] = "{not json";
    expect(verifyLedger(lines)).toMatchObject({ ok: false, code: "E_PARSE", line: 2, firstBadSeq: 2, countOk: 1 });

    const other = fx("ok.jsonl");
    const e = JSON.parse(other[0] ?? "") as Record<string, unknown>;
    e.org_id = "o_other";
    const { hash: _h, ...rest } = e;
    e.hash = sha256Tag(jcs(rest));
    other[0] = JSON.stringify(e);
    expect(verifyLedger(other)).toMatchObject({ ok: false, code: "E_ORG", line: 1 });

    const both = fx("ok.jsonl");
    const b = JSON.parse(both[0] ?? "") as Record<string, unknown>;
    b.org_id = "o_other";
    both[0] = JSON.stringify(b); // hash is now also wrong
    expect(verifyLedger(both)).toMatchObject({ ok: false, code: "E_ORG" });
    expect(verifyLedger(both, { org: "o_local" })).toMatchObject({ ok: false, code: "E_ORG" });
  });

  it("verify: E_SCHEMA", () => {
    const lines = fx("ok.jsonl");
    lines[0] = JSON.stringify({ ...(JSON.parse(lines[0] ?? "") as object), extra: 1 });
    expect(verifyLedger(lines)).toMatchObject({ ok: false, code: "E_SCHEMA", line: 1, firstBadSeq: 1, countOk: 0 });
  });

  it("verify: краен LF и празен файл (D-128)", () => {
    const lines = fx("ok.jsonl");
    expect(lines.at(-1)).toBe("");
    expect(verifyLedger(lines)).toMatchObject({ ok: true, count: 5 });
    expect(verifyLedger([])).toEqual({ ok: true, count: 0, lastHash: null });
    expect(verifyLedger([""])).toEqual({ ok: true, count: 0, lastHash: null });
    const mid = fx("ok.jsonl");
    mid.splice(2, 0, "");
    expect(verifyLedger(mid)).toMatchObject({ ok: false, code: "E_PARSE", line: 3 });
  });

  it("lastHash е hash на последния ред", () => {
    const lines = fx("ok.jsonl");
    const last = JSON.parse(lines[4] ?? "") as { hash: string };
    expect(verifyLedger(lines)).toEqual({ ok: true, count: 5, lastHash: last.hash });
  });

  it("property: подмяна на произволен ред се хваща", () => {
    const fields = ["org_id", "seq", "ts", "kind", "task_id", "payload_hash", "prev_hash"] as const;
    const alt: Record<(typeof fields)[number], (old: unknown, salt: number) => unknown> = {
      org_id: () => "o_other",
      seq: (old, salt) => (old as number) + 1 + salt,
      ts: (_o, salt) => new Date(Date.UTC(2020, 0, 1) + salt).toISOString(),
      kind: (old) => (old === "verdict" ? "memory_snapshot" : "verdict"),
      task_id: (old) => (old === "t_other" ? "t_other2" : "t_other"),
      payload_hash: (_o, salt) => sha256Tag(`p${salt}`),
      prev_hash: (_o, salt) => sha256Tag(`h${salt}`),
    };
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }).chain((n) =>
          fc.tuple(fc.constant(n), fc.integer({ min: 1, max: n }), fc.constantFrom(...fields), fc.nat(1000)),
        ),
        ([n, k, field, salt]) => {
          const lines = chain(n);
          const e = JSON.parse(lines[k - 1] ?? "") as Record<string, unknown>;
          const next = alt[field](e[field], salt);
          expect(next).not.toEqual(e[field]);
          e[field] = next;
          lines[k - 1] = JSON.stringify(e);
          const r = verifyLedger(lines);
          expect(r.ok).toBe(false);
          if (!r.ok) expect(r.firstBadSeq).toBe(k);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("appendSecurityEvent", () => {
  const runId = "r_" + ulid();
  const base = { task_id: "t_fix_discount", run_id: runId, attempt: 1 as const, source: "gate" as const };

  it("warn → ред в дневника и ledger-payloads (D-042, D-106)", () => {
    const home = tmp();
    const secret = "zQ8".repeat(10);
    const r = createRedactor({ exactSecrets: [secret] });
    const { event, ledger } = appendSecurityEvent({
      home,
      ev: { ...base, kind: "proxy_block", severity: "warn", detail: { path: `/x/${secret}`, count: 2 } },
      r,
      now: T0,
    });
    expect(event.id).toMatch(/^se_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(event.detail).toEqual({ path: "/x/[REDACTED:exact]", count: 2 });
    expect(event.created_at).toBe(T0.toISOString());
    expect(ledger?.kind).toBe("security_event");
    const events = readFileSync(path.join(home, "security_events.jsonl"), "utf8");
    expect(events).not.toContain(secret);
    expect(JSON.parse(events.trim())).toEqual(event);
    const payloads = readFileSync(path.join(home, "runs", runId, "ledger-payloads.jsonl"), "utf8").trim().split("\n");
    const row = JSON.parse(payloads[0] ?? "") as { seq: number; payload: unknown };
    expect(row.seq).toBe(ledger?.seq);
    expect(row.payload).toEqual({ kind: "proxy_block", run_id: runId, detail_hash: hashJcs(event.detail) });
    expect(hashJcs(row.payload)).toBe(ledger?.payload_hash);
    expect(verifyLedger(readFileSync(path.join(home, "ledger.jsonl"), "utf8").split("\n")).ok).toBe(true);
  });

  it("info → само security_events.jsonl", () => {
    const home = tmp();
    const { ledger } = appendSecurityEvent({
      home,
      ev: { ...base, kind: "redaction_hit", severity: "info", detail: { entropy: 3 } },
      r: createRedactor({ exactSecrets: [] }),
    });
    expect(ledger).toBeNull();
    expect(existsSync(path.join(home, "ledger.jsonl"))).toBe(false);
  });

  it("run_id null → без payload ред", () => {
    const home = tmp();
    const { ledger } = appendSecurityEvent({
      home,
      ev: { ...base, run_id: null, attempt: null, kind: "budget_stop", severity: "incident", detail: {} },
      r: createRedactor({ exactSecrets: [] }),
    });
    expect(ledger?.seq).toBe(1);
    expect(existsSync(path.join(home, "runs"))).toBe(false);
  });

  it("невалидно събитие хвърля", () => {
    writeFileSync(path.join(tmp(), "x"), "");
    expect(() =>
      appendSecurityEvent({
        home: tmp(),
        ev: { ...base, kind: "proxy_block", severity: "warn", detail: { long: "x".repeat(301) } },
        r: createRedactor({ exactSecrets: [] }),
      }),
    ).toThrow();
  });
});
