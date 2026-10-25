import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GoldenSet } from "@mandat/contract";
import { PROVIDERS, runRs } from "../spikes/rs-lib.mjs";

// E8к (v5 т. 4.10): the RS spike runner — without keys every provider is SKIPPED (no request); with a key, retrieval
// hits of the golden set, the share of snippets that are substrings of the page, latency and cost; keys are never printed.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const golden = GoldenSet.parse(JSON.parse(readFileSync(path.join(repo, "fixtures/research/golden.json"), "utf8")) as unknown);

describe("RS spike runner (E8к)", () => {
  it("без ключове: всички доставчици SKIPPED, нито една заявка", async () => {
    let calls = 0;
    const r = await runRs({ env: {}, golden, fetch: () => { calls++; throw new Error("no"); } });
    expect(calls).toBe(0);
    expect(Object.keys(r.providers).sort()).toEqual([...PROVIDERS].sort());
    for (const p of Object.values(r.providers)) expect(p).toMatchObject({ status: "SKIPPED" });
  });

  it("Tavily с ключ: попадения, дял подниз-цитати, цена; ключът не е в изхода", async () => {
    const seen: { url: string; auth: string | null }[] = [];
    const fetch = async (url: string, init: { headers: Record<string, string>; body?: string }) => {
      seen.push({ url, auth: init.headers.Authorization ?? null });
      const q = (JSON.parse(init.body ?? "{}") as { query: string }).query;
      const hit = q.includes("PostgreSQL");
      const results = [{ url: "https://x.example/a", title: "a", content: hit ? "The default port is 5432." : "nothing here", raw_content: hit ? "Docs. The default port is 5432. More." : "other text" }];
      return { ok: true, status: 200, json: async () => ({ results, usage: { credits: 1 } }) };
    };
    const r = await runRs({ env: { TAVILY_API_KEY: "tvly-secret-123" }, golden, fetch, only: ["tavily"], limit: 3, now: (() => { let t = 0; return () => (t += 10); })() });
    const t = r.providers.tavily;
    expect(t).toMatchObject({ status: "OK", questions: 3, credits: 3 });
    expect(seen.every((s) => s.url === "https://api.tavily.com/search" && s.auth === "Bearer tvly-secret-123")).toBe(true);
    expect(JSON.stringify(r)).not.toContain("tvly-secret-123");
    expect(r.providers.exa).toMatchObject({ status: "SKIPPED" });
  });

  it("грешка на доставчика → FAILED с HTTP кода, без текста на отговора", async () => {
    const fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: "bad key tvly-secret" }) });
    const r = await runRs({ env: { TAVILY_API_KEY: "tvly-secret" }, golden, fetch, only: ["tavily"], limit: 1 });
    expect(r.providers.tavily).toMatchObject({ status: "FAILED", error: "http_401" });
    expect(JSON.stringify(r)).not.toContain("tvly-secret");
  });
});
