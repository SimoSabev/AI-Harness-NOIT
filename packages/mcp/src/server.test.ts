import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import type { JobBackend } from "./backend.js";
import { explain } from "@mandat/contract";
import { spawnVerifyProcess } from "./jobs.js";
import { createMandatServer } from "./server.js";

// The three tools in-process (the stdio path is mcp-stdio.test.ts).
const backend = (o: Partial<JobBackend> = {}): JobBackend => ({
  verify: () => Promise.resolve({ ok: true, job_id: "j_01JABCDEFGHJKMNPQRSTVWXYZ0" }),
  status: (id) => Promise.resolve({ job_id: id, status: "done", result: "FAILED", reasons: ["D2:missing_test:a > b"], effective_level: 1, level_reasons: ["external_cap"], ledger_seq: 2, elapsed_s: 3 }),
  explain: () => Promise.resolve("text"),
  ...o,
});
async function client(b: JobBackend) {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await createMandatServer(b).connect(st);
  const c = new Client({ name: "t", version: "1" });
  await c.connect(ct);
  return c;
}
const text = (r: unknown) => JSON.parse(((r as { content: { text: string }[] }).content[0]?.text ?? "{}")) as Record<string, unknown>;

describe("createMandatServer", () => {
  it("verify / status / explain; грешките са isError", async () => {
    const c = await client(backend());
    expect(text(await c.callTool({ name: "mandat_verify", arguments: { task_type: "bugfix" } }))).toEqual({ job_id: "j_01JABCDEFGHJKMNPQRSTVWXYZ0", status: "running", poll_after_s: 5 });
    expect(text(await c.callTool({ name: "mandat_status", arguments: { job_id: "j_01JABCDEFGHJKMNPQRSTVWXYZ0" } }))).toMatchObject({ result: "FAILED", effective_level: 1 });
    expect(text(await c.callTool({ name: "mandat_explain", arguments: { job_id: "j_01JABCDEFGHJKMNPQRSTVWXYZ0", lang: "bg" } }))).toEqual({ text: "text" });
    const e = await client(backend({ verify: () => Promise.resolve({ ok: false, error: "busy" }), status: () => Promise.resolve({ error: "unknown job" }), explain: () => Promise.resolve({ error: "unknown job" }) }));
    for (const [name, args] of [["mandat_verify", { repo_path: "/x" }], ["mandat_status", { job_id: "j_01JABCDEFGHJKMNPQRSTVWXYZ0" }], ["mandat_explain", { job_id: "j_01JABCDEFGHJKMNPQRSTVWXYZ0" }]] as const) {
      const r = (await e.callTool({ name, arguments: args })) as { isError?: boolean };
      expect(r.isError).toBe(true);
    }
  });
  it("explain: всички класове от таблицата на двата езика", () => {
    const reasons = ["D2:missing_test:a > b", "D2:weakened:a > b", "D2:weakened_assertions:a > b", "D2:skipped:a > b", "D2:only:t.ts", "D2:zero_tests:-", "D2:report_mismatch:-", "D1:regression:a > b", "D1:flaky_history:x", "D3:protected:.github/x", "D3:config:.mandat.yml", "D4:out_of_contract:src/x", "POLICY:base_untrusted:no_remote", "POLICY:missing:.mandat.yml", "EXPORT:empty_change:-", "INFRA:same_uid:-"];
    for (const lang of ["bg", "en"] as const) {
      const t = explain({ result: "FAILED", reasons, lang }).split("\n");
      expect(t).toHaveLength(reasons.length + 1);
      expect(t.some((l) => l.includes("see evidence") || l.includes("виж evidence"))).toBe(false);
    }
  });
  it("spawnVerifyProcess пуска процес и не подава тайни от env", async () => {
    const d = mkdtempSync(path.join(os.tmpdir(), "mandat-sv-"));
    const bin = path.join(d, "echo.mjs");
    writeFileSync(bin, "console.log(JSON.stringify({ argv: process.argv.slice(2), key: process.env.ANTHROPIC_API_KEY ?? null }));");
    process.env.ANTHROPIC_API_KEY = "fake-test-value";
    try {
      const r = await spawnVerifyProcess(bin)(["--repo", "/x"]);
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({ argv: ["--repo", "/x"], key: null });
      expect((await spawnVerifyProcess(path.join(d, "missing.mjs"))([])).code).not.toBe(0);
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });
});
