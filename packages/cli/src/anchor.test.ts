import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { verifyTsResponse, anchorDatum } from "@mandat/ledger";
import { localTsa } from "../../ledger/src/local-tsa.test-helper.js";
import { runCli } from "./cli.js";
import type { CliDeps } from "./deps.js";

async function cli(args: string[], deps: Partial<CliDeps>, env: Record<string, string>) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(["node", "mandat", ...args], { stdout: (s) => (stdout += s), stderr: (s) => (stderr += s), env, cwd: process.cwd() }, deps as CliDeps);
  return { code, stdout, stderr };
}

describe("mandat anchor (т. 5.4)", () => {
  it("o_local: котва на последния hash в anchors.jsonl; без TSA_URLS → 2; празен дневник → 3", async () => {
    const tsa = await localTsa();
    const home = mkdtempSync(path.join(os.tmpdir(), "mandat-anchor-"));
    const fetcher = async (_u: string, b: Uint8Array) => ({ status: 200, body: await tsa.respond(b) });
    expect((await cli(["--home", home, "anchor"], { tsaFetcher: fetcher }, {})).code).toBe(2);
    expect((await cli(["--home", home, "anchor"], { tsaFetcher: fetcher }, { TSA_URLS: "https://t.invalid" })).code).toBe(3);
    const last = `sha256:${"cd".repeat(32)}`;
    writeFileSync(path.join(home, "ledger.jsonl"), JSON.stringify({ seq: 7, hash: last }) + "\n");
    const r = await cli(["--home", home, "anchor"], { tsaFetcher: fetcher }, { TSA_URLS: "https://t.invalid" });
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^anchored seq 7 \(sha256:cdcdcdcdcdcd…\) at .* by https:\/\/t\.invalid\n$/);
    const row = JSON.parse(readFileSync(path.join(home, "anchors.jsonl"), "utf8")) as { tsr_b64: string };
    expect(await verifyTsResponse(new Uint8Array(Buffer.from(row.tsr_b64, "base64")), anchorDatum(last), null)).toMatchObject({ ok: true });
    const bad = await cli(["--home", home, "anchor"], { tsaFetcher: async () => ({ status: 500, body: new Uint8Array() }) }, { TSA_URLS: "https://t.invalid" });
    expect(bad.code).toBe(3);
    expect((await cli(["--home", home, "anchor", "--org", "x"], {}, { TSA_URLS: "https://t.invalid" })).code).toBe(2);
  });
});
