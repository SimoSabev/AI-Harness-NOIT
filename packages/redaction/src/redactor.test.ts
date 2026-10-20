import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createRedactor, shannonEntropy, writeRedacted } from "./index.js";

type Corpus = { keys: { kind: string; value: string }[]; false_positives: string[] };
const corpus = JSON.parse(
  readFileSync(new URL("../../../fixtures/redaction/corpus.json", import.meta.url), "utf8"),
) as Corpus;
const BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const base62 = (n: number): string => Array.from(randomBytes(n), (b) => BASE62[b % 62]).join("");
const r = createRedactor({ exactSecrets: [] });

describe("redaction corpus", () => {
  it("50/50 ключа редактирани, 0/22 лъжливо положителни", () => {
    expect(corpus.keys).toHaveLength(50);
    expect(corpus.false_positives).toHaveLength(22);
    const missed = corpus.keys.filter((k) => r.redactText(`value: ${k.value} end`).text.includes(k.value));
    expect(missed).toEqual([]);
    const touched = corpus.false_positives.filter((s) => r.redactText(s).text !== s);
    expect(touched).toEqual([]);
  });

  it("всеки вид дава своя етикет", () => {
    for (const k of corpus.keys) {
      expect(r.redactText(k.value).text).toBe(`[REDACTED:${k.kind}]`);
    }
  });

  it("ключовете в корпуса са с правилната дължина (D-125)", () => {
    const prefix: Record<string, RegExp> = {
      anthropic: /^sk-ant-[a-z0-9]+-/,
      openai: /^sk-[A-Za-z0-9]+-/,
      github: /^gh[pousr]_/,
      supabase: /^sb_secret_/,
      slack: /^xox[baprs]-/,
      jwt: /^eyJ/,
      mandat_token: /^mdt_/,
      entropy: /^/,
    };
    for (const k of corpus.keys) {
      if (k.kind === "aws") {
        expect(k.value).toMatch(/^AKIA[0-9A-Z]{16}$/);
        continue;
      }
      const re = prefix[k.kind];
      if (!re) throw new Error(`unknown kind ${k.kind}`);
      expect(k.value.replace(re, "").length).toBeGreaterThanOrEqual(32);
    }
  });
});

describe("redactor", () => {
  it("canary точно съвпадение", () => {
    const canary = base62(40);
    const rr = createRedactor({ exactSecrets: [canary] });
    const out = rr.redactText(`xx${canary}yy`);
    expect(out.text).toBe("xx[REDACTED:exact]yy");
    expect(out.hits).toEqual({ exact: 1 });
  });

  it("празен exact секрет се игнорира", () => {
    expect(createRedactor({ exactSecrets: [""] }).redactText("abc").text).toBe("abc");
  });

  it("mdt_ токен", () => {
    const tok = corpus.keys.find((k) => k.kind === "mandat_token");
    if (!tok) throw new Error("fixture");
    const out = r.redactJson({ line: JSON.stringify({ headers: { "x-api-key": tok.value } }) });
    expect(JSON.stringify(out.value)).not.toContain(tok.value);
    expect(JSON.stringify(out.value)).toContain("[REDACTED:mandat_token]");
    expect(out.hits.mandat_token).toBe(1);
  });

  it("mdt_ токен, завършващ с '-' (lookahead, D-139)", () => {
    const t = `mdt_${base62(30)}.${base62(42)}-`;
    expect(r.redactText(`"${t}"`).text).toBe('"[REDACTED:mandat_token]"');
  });

  it("redactJson обхожда масиви, ключове и запазва не-низовете", () => {
    const k = corpus.keys[0]?.value ?? "";
    const out = r.redactJson({ a: [1, true, null, k], [k]: { n: 2 } });
    expect(out.value).toEqual({ a: [1, true, null, "[REDACTED:anthropic]"], "[REDACTED:anthropic]": { n: 2 } });
    expect(out.hits.anthropic).toBe(2);
  });

  it("allowlist", () => {
    for (const s of [
      "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
      "sha256:" + "ab".repeat(32),
      "123e4567-e89b-12d3-a456-426614174000",
      "123E4567-E89B-12D3-A456-426614174000",
      "sha512-+d4RUq3E3K+3/J4MysB3z4QXA4rkDNt70VYpTLE6kJCnUe/Z6SB8VJsVJG/NV4bECrvkxkLHjXk+vrgBstfZkw==",
    ]) {
      expect(r.redactText(s).text).toBe(s);
    }
  });

  it("entropy по сегменти (D-059)", () => {
    const p1 = ".mandat/runs/r_01JB8Z3K4M5N6P7Q8R9S0T1V2W/verdict.json";
    const p2 = "mandat-sandbox:cc2.1.302-1a2b3c4d5e6f";
    expect(r.redactText(p1).text).toBe(p1);
    expect(r.redactText(p2).text).toBe(p2);
    expect(corpus.false_positives).toContain(p1);
    expect(corpus.false_positives).toContain(p2);
    let seg = base62(40);
    while (shannonEntropy(seg) < 4.5) seg = base62(40);
    expect(r.redactText(`src/${seg}/x.ts`).text).toBe("src/[REDACTED:entropy]/x.ts");
  });

  it("D-140: вградени ID-та и NAME=value", () => {
    const names = ["mandat-net-r_01JB8Z3K4M5N6P7Q8R9S0T1V2W-agent", "mandat-vol-r_01JB8Z3K4M5N6P7Q8R9S0T1V2W-b"];
    for (const n of names) expect(r.redactText(n).text).toBe(n);
    expect(r.redactText("ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-5-5").text).toBe(
      "ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-5-5",
    );
    let v = base62(40);
    while (shannonEntropy(v) < 4.5) v = base62(40);
    expect(r.redactText(`AWS_SECRET_ACCESS_KEY=${v}`).text).toBe("[REDACTED:entropy]");
    expect(r.redactText(`r_01JB8Z3K4M5N6P7Q8R9S0T1V2W${v}`).text).toBe("[REDACTED:entropy]");
  });

  it("shannonEntropy", () => {
    expect(shannonEntropy("")).toBe(0);
    expect(shannonEntropy("aaaa")).toBe(0);
    expect(shannonEntropy("abcd")).toBe(2);
  });

  it("property: идемпотентност", () => {
    const keyArb = fc.constantFrom(...corpus.keys.map((k) => k.value));
    const textArb = fc.array(fc.oneof(fc.string(), keyArb, fc.constantFrom(...corpus.false_positives)), { maxLength: 6 });
    fc.assert(
      fc.property(textArb, (parts) => {
        const once = r.redactText(parts.join(" ")).text;
        expect(r.redactText(once).text).toBe(once);
      }),
      { numRuns: 300 },
    );
  });

  it("property: вграден ключ изчезва", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.constantFrom(...corpus.keys.map((k) => k.value)), (a, b, key) => {
        expect(r.redactText(`${a} ${key} ${b}`).text).not.toContain(key);
      }),
      { numRuns: 300 },
    );
  });
});

describe("writeRedacted", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "mandat-redaction-"));

  it("обект с canary → [REDACTED:exact], hits.exact = 1", async () => {
    const canary = base62(40);
    const rr = createRedactor({ exactSecrets: [canary] });
    const f = path.join(dir, "obj.json");
    const res = await writeRedacted(f, { env: { AWS_SECRET_ACCESS_KEY: canary } }, rr);
    expect(res.hits).toEqual({ exact: 1 });
    const text = readFileSync(f, "utf8");
    expect(text).toContain("[REDACTED:exact]");
    expect(text).not.toContain(canary);
    expect(text.endsWith("}\n")).toBe(true);
  });

  it("append пише JSONL и текст", async () => {
    const f = path.join(dir, "lines.jsonl");
    await writeRedacted(f, { a: 1 }, r, { append: true });
    await writeRedacted(f, { b: 2 }, r, { append: true });
    await writeRedacted(f, "plain\n", r, { append: true });
    expect(readFileSync(f, "utf8")).toBe('{"a":1}\n{"b":2}\nplain\n');
  });

  it("maxBytes (D-136)", async () => {
    const f = path.join(dir, "capped.txt");
    const chunk = "x".repeat(59) + "\n";
    for (let i = 0; i < 3; i++) await writeRedacted(f, chunk, r, { append: true, maxBytes: 100 });
    expect(readFileSync(f, "utf8")).toBe(chunk + "[truncated at 100 bytes]\n");
    const big = path.join(dir, "big.txt");
    const k = corpus.keys[0]?.value ?? "";
    const res = await writeRedacted(big, Array(10).fill(k).join(" "), r, { maxBytes: 10 });
    expect(res.hits.anthropic).toBe(10);
    expect(readFileSync(big, "utf8")).toBe("[truncated at 10 bytes]\n");
  });
});
