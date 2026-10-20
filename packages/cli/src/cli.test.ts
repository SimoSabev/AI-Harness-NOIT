import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCli } from "./cli.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const fx = (p: string): string => path.join(repo, "fixtures", p);
const tmp = (): string => mkdtempSync(path.join(tmpdir(), "mandat-cli-"));

async function cli(args: string[], env: Record<string, string> = {}) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(["node", "mandat", ...args], {
    stdout: (s) => (stdout += s),
    stderr: (s) => (stderr += s),
    env,
    cwd: repo,
  });
  return { code, stdout, stderr };
}

describe("verify-log", () => {
  it("verify-log exit кодове (D-128)", async () => {
    const ok = await cli(["verify-log", "--ledger", fx("ledger/ok.jsonl")]);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain("ledger fixtures/ledger/ok.jsonl · org o_local · 5 lines");
    expect(ok.stdout).toMatch(/OK: chain intact \(seq 1\.\.5, last sha256:[0-9a-f]{12}…\)/);

    const bad = await cli(["verify-log", "--ledger", fx("ledger/tampered.jsonl")]);
    expect(bad.code).toBe(1);
    expect(bad.stdout).toContain("seq 3");
    expect(bad.stdout).toMatch(/TAMPERED: seq 3 \(line 3\) E_HASH — expected sha256:[0-9a-f]{12}…, recorded sha256:[0-9a-f]{12}…/);
    expect(bad.stdout).toContain("lines 1..2 verified; nothing after seq 3 is trusted");

    const emptyFile = path.join(tmp(), "empty.jsonl");
    writeFileSync(emptyFile, "");
    const empty = await cli(["verify-log", "--ledger", emptyFile]);
    expect(empty.code).toBe(0);
    expect(empty.stdout).toContain("OK: empty ledger");

    const missingPath = path.join(tmp(), "nope.jsonl");
    const missing = await cli(["verify-log", "--ledger", missingPath]);
    expect(missing.code).toBe(3);
    expect(missing.stderr).toContain(`ledger not found: ${missingPath}`);

    expect((await cli(["verify-log", "--bogus"])).code).toBe(2);
    expect((await cli(["no-such-command"])).code).toBe(2);
    expect((await cli(["verify-log", "--org", "o_other", "--ledger", fx("ledger/ok.jsonl")])).code).toBe(2);
  });

  it("E_PARSE текст (D-128)", async () => {
    const f = path.join(tmp(), "l.jsonl");
    const lines = readFileSync(fx("ledger/ok.jsonl"), "utf8").split("\n");
    lines[0] = "{";
    writeFileSync(f, lines.join("\n"));
    const r = await cli(["verify-log", "--ledger", f]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("TAMPERED: seq 1 (line 1) E_PARSE — invalid JSON");
    expect(r.stdout).toContain("no lines verified; nothing after seq 1 is trusted");
  });

  it("verify-log --json", async () => {
    const r = await cli(["verify-log", "--ledger", fx("ledger/tampered.jsonl"), "--json"]);
    expect(r.code).toBe(1);
    const lines = r.stdout.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({ ok: false, firstBadSeq: 3, code: "E_HASH" });
  });

  it("ledger по подразбиране = <MANDAT_HOME>/ledger.jsonl; --home печели", async () => {
    const home = tmp();
    copyFileSync(fx("ledger/ok.jsonl"), path.join(home, "ledger.jsonl"));
    expect((await cli(["verify-log"], { MANDAT_HOME: home })).code).toBe(0);
    const other = tmp();
    expect((await cli(["--home", other, "verify-log"], { MANDAT_HOME: home })).code).toBe(3);
  });
});

describe("contract", () => {
  it("seal: записва, идемпотентен, exit 5 при невалиден", async () => {
    const dir = tmp();
    const f = path.join(dir, "c.json");
    const sample = JSON.parse(readFileSync(fx("contracts/sample.json"), "utf8")) as Record<string, unknown>;
    delete sample.contract_hash;
    sample.config_hash = "sha256:" + "0".repeat(64);
    writeFileSync(f, JSON.stringify(sample));
    const r = await cli(["contract", "seal", f]);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(new RegExp(`^sealed ${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} contract_hash sha256:[0-9a-f]{64}\\n$`));
    const first = readFileSync(f, "utf8");
    expect(first).toBe(readFileSync(fx("contracts/sample.json"), "utf8"));
    await cli(["contract", "seal", f]);
    expect(readFileSync(f, "utf8")).toBe(first);

    writeFileSync(f, JSON.stringify({ ...sample, x: 1 }));
    expect((await cli(["contract", "seal", f])).code).toBe(5);
    writeFileSync(f, "{");
    expect((await cli(["contract", "seal", f])).code).toBe(5);
    expect((await cli(["contract", "seal", path.join(dir, "missing.json")])).code).toBe(5);
  });

  it("show-agent печата contract.txt", async () => {
    const r = await cli(["contract", "show-agent", fx("contracts/sample.json")]);
    expect(r.code).toBe(0);
    expect(r.stdout.startsWith("# Mandat task contract\n")).toBe(true);
    expect(r.stdout.endsWith("(no data)\n")).toBe(true);
    const bad = path.join(tmp(), "c.json");
    writeFileSync(bad, JSON.stringify({ ...JSON.parse(readFileSync(fx("contracts/sample.json"), "utf8")), text: "x" }));
    expect((await cli(["contract", "show-agent", bad])).code).toBe(5);
  });
});

describe("истински процес", () => {
  const main = path.join(repo, "packages/cli/dist/main.js");

  it("node packages/cli/dist/main.js: exit кодове", () => {
    const ok = spawnSync("node", [main, "verify-log", "--ledger", "fixtures/ledger/ok.jsonl"], { cwd: repo });
    expect(ok.status).toBe(0);
    const bad = spawnSync("node", [main, "verify-log", "--ledger", "fixtures/ledger/tampered.jsonl"], { cwd: repo });
    expect(bad.status).toBe(1);
    expect(spawnSync("node", [main, "verify-log", "--nope"], { cwd: repo }).status).toBe(2);
  });

  it("pnpm --silent --json (D-085)", () => {
    const out = execFileSync("pnpm", ["--silent", "mandat", "verify-log", "--ledger", "fixtures/ledger/ok.jsonl", "--json"], {
      cwd: repo,
      encoding: "utf8",
    });
    const lines = out.split("\n").filter((l) => l.trim().length > 0);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({ ok: true, count: 5 });
  });
});
