import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Verdict, hashJcs, parseVitestReport } from "@mandat/contract";
import type { Channel } from "@mandat/channels";
import { verifyLedger } from "@mandat/ledger";
import { createRedactor } from "@mandat/redaction";
import type { DockerRunner } from "@mandat/sandbox";
import { buildShopFixture } from "./fixtures.js";
import { startRunGate } from "@mandat/verify";
import type { RunGate } from "@mandat/verify";
import { runTask } from "./run.js";
import type { RunInternals, RunTaskInput } from "./run.js";
import type { TestProcedureInput, TestProcedureResult } from "@mandat/verify";
import { FakeDocker, fixtureReport, repoRoot, shopCopy } from "./fake-docker.test-helper.js";

const M = "tests/cart.spec.ts > cart > applies 10% over 50";
const CONTRACT = path.join(repoRoot, "contracts", "fix-discount.json");
const IMAGES = { sandbox: "mandat-sandbox:cc2.1.302-test", gate: "mandat-egress-gate:v0.1.0-test", proxy: "mandat-llm-proxy:v0.1.0-test" };
const BASE_RAW = fixtureReport("base-1fail.json");
const ALL_PASS_RAW = (() => {
  const j = JSON.parse(BASE_RAW) as { success: boolean; numFailedTests: number; numPassedTests: number; testResults: { status: string; assertionResults: { status: string; failureMessages: string[] }[] }[] };
  for (const f of j.testResults) {
    f.status = "passed";
    for (const a of f.assertionResults) {
      a.status = "passed";
      a.failureMessages = [];
    }
  }
  j.success = true;
  j.numFailedTests = 0;
  j.numPassedTests = 20;
  return JSON.stringify(j);
})();
const ok = (raw: string, exit = 0): TestProcedureResult => ({ ok: true, exit, timedOut: false, raw, report: parseVitestReport(raw, "/m/work") });

const homes: string[] = [];
afterEach(() => {
  for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true });
  vi.restoreAllMocks();
});
function home(): string {
  const h = mkdtempSync(path.join(os.tmpdir(), "mandat-wt-"));
  homes.push(h);
  buildShopFixture({ repoRoot, mandatHome: h, force: false });
  return h;
}

function fakeGate(): typeof startRunGate {
  return (ctx) => {
    const sub = ctx.tree === "agent" ? "" : `${ctx.tree}/`;
    const log = path.join(ctx.runDir, "gate", `${sub}log`, "events.jsonl");
    mkdirSync(path.dirname(log), { recursive: true });
    const g: RunGate = {
      ip: "172.30.0.2", net: `mandat-net-${ctx.runId}-${ctx.tree}`, name: `mandat-gate-${ctx.runId}-${ctx.tree}`,
      paths: { policyDir: "", logDir: path.dirname(log), log, resolv: "", hosts: "" },
      setPolicy: () => Promise.resolve(),
      stop: () => Promise.resolve(),
    };
    return Promise.resolve(g);
  };
}

type Opts = { docker: DockerRunner; tests?: (i: TestProcedureInput) => TestProcedureResult; x?: Partial<RunInternals>; i?: Partial<RunTaskInput>; h?: string };
async function go(o: Opts) {
  const h = o.h ?? home();
  const testsCalls: TestProcedureInput[] = [];
  const r = await runTask({
    home: h, contractPath: CONTRACT, agent: "fake:honest-fix", keep: false, json: true, docker: o.docker,
    ...o.i,
    internals: {
      repoRoot, env: {}, images: IMAGES, gitVersion: () => "2.47.1", healthz: () => Promise.resolve(false), startGate: fakeGate(),
      ipv6Sysctl: true, infraUser: "1000:1000",
      runTests: (i) => {
        testsCalls.push(i);
        const res = o.tests ? o.tests(i) : ok(i.tree === "base" ? BASE_RAW : ALL_PASS_RAW);
        // D-300: unless a test says otherwise, every mutant breaks the fix (M fails again, like on base)
        if (i.mutants && res.ok && !res.mutants) return Promise.resolve({ ...res, mutants: i.mutants.map(() => ({ exit: 1, timedOut: false, report: parseVitestReport(BASE_RAW, "/m/work") })) });
        return Promise.resolve(res);
      },
      ...o.x,
    },
  });
  const ledgerLines = existsSync(path.join(h, "ledger.jsonl")) ? readFileSync(path.join(h, "ledger.jsonl"), "utf8").split("\n").filter(Boolean) : [];
  const events = existsSync(path.join(h, "security_events.jsonl")) ? readFileSync(path.join(h, "security_events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { kind: string; severity: string }) : [];
  return { r, h, testsCalls, ledgerLines, events };
}
const honest = () => shopCopy((d) => writeFileSync(path.join(d, "src/cart.ts"), readFileSync(path.join(d, "src/cart.ts"), "utf8").replace("= 50000;", "= 5000;")));
const det = (r: Awaited<ReturnType<typeof go>>["r"], d: string) => r.verdict?.evidence.find((e) => e.detector === d);

describe("runTask (fake docker)", () => {
  it("D11 (D-300): мутантът на поправката оцелява (тестовете пак минават) → UNKNOWN D11:survived, мутантите вървят на B", async () => {
    const { r, testsCalls } = await go({
      docker: new FakeDocker({ head: honest }),
      tests: (i) => ({ ...ok(i.tree === "base" ? BASE_RAW : ALL_PASS_RAW), ...(i.mutants ? { mutants: i.mutants.map(() => ({ exit: 0, timedOut: false, report: parseVitestReport(ALL_PASS_RAW, "/m/work") })) } : {}) }),
    });
    expect(r.verdict?.result).toBe("UNKNOWN");
    expect(r.verdict?.reasons).toContain("D11:survived:src/cart.ts:10");
    expect(testsCalls.filter((c) => c.mutants).map((c) => c.tree)).toEqual(["b"]);
    expect(testsCalls.find((c) => c.mutants)?.mutants?.[0]?.mutated.toString("utf8")).toContain("const DISCOUNT_THRESHOLD_CENTS = 0;");
  });

  it("честна поправка → VERIFIED, 3 реда в дневника, verify-log ok", async () => {
    const { r, ledgerLines, events } = await go({ docker: new FakeDocker({ head: honest }) });
    expect(r.verdict?.result).toBe("VERIFIED");
    expect(r.exit).toBe(0);
    expect(r.verdict?.tree_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(r.verdict?.integrity).toBe("ok");
    expect(ledgerLines).toHaveLength(3);
    expect(verifyLedger(ledgerLines).ok).toBe(true);
    expect(events.filter((e) => e.severity !== "info")).toEqual([]);
    expect(r.ledger).toEqual({ from: 1, to: 3 });
  });

  it("edge: no-op → EXPORT pass 0 файла, MUST_PASS fail → FAILED, exit 20", async () => {
    const { r } = await go({ docker: new FakeDocker({ head: () => shopCopy() }), tests: () => ok(BASE_RAW) });
    expect(det(r, "EXPORT")?.status).toBe("pass");
    expect(det(r, "EXPORT")?.data.files).toBe(0);
    expect(r.verdict?.reasons).toContain(`MUST_PASS:not_passed:${M}`);
    expect([r.verdict?.result, r.exit]).toEqual(["FAILED", 20]);
  });

  it("edge: изтрит файл → статус D", async () => {
    const { r } = await go({ docker: new FakeDocker({ head: () => shopCopy((d) => rmSync(path.join(d, "src/money.ts"))) }), tests: (i) => ok(i.tree === "base" ? BASE_RAW : BASE_RAW) });
    const cs = JSON.parse(readFileSync(path.join(r.runDir ?? "", "export", "changeset.json"), "utf8")) as { files: { path: string; status: string }[] };
    expect(cs.files).toEqual([expect.objectContaining({ path: "src/money.ts", status: "D" })]);
  });

  it("infra след стъпка 7: install exit 1 → UNKNOWN infra:install_base, +3 реда, exit 3", async () => {
    const { r, ledgerLines } = await go({ docker: new FakeDocker({ installExit: 1, head: honest }) });
    expect(r.verdict?.result).toBe("UNKNOWN");
    expect(r.verdict?.reasons).toEqual(["infra:install_base", "INFRA:INSTALL_BASE:-"]);
    expect(r.exit).toBe(3);
    expect(ledgerLines).toHaveLength(3);
  });

  it("preflight без run (D-038)", async () => {
    const h = home();
    const old = await go({ h, docker: new FakeDocker({ dockerVersion: "24.0.0" }) });
    expect([old.r.exit, old.r.error?.code, existsSync(path.join(h, "ledger.jsonl"))]).toEqual([3, "E_DOCKER_VERSION", false]);
    rmSync(path.join(h, "mirrors"), { recursive: true });
    const nm = await go({ h, docker: new FakeDocker() });
    expect([nm.r.exit, nm.r.error?.code]).toEqual([3, "E_MIRROR_MISSING"]);
    const bad = path.join(h, "bad.json");
    writeFileSync(bad, JSON.stringify({ ...JSON.parse(readFileSync(CONTRACT, "utf8")), text: "tampered" }));
    expect((await go({ h, docker: new FakeDocker(), i: { contractPath: bad } })).r.exit).toBe(5);
    expect((await go({ h, docker: new FakeDocker(), x: { gitVersion: () => "2.42.0" } })).r.error?.code).toBe("E_GIT_VERSION");
    expect((await go({ h, docker: new FakeDocker(), i: { agent: "fake:nope" as "fake:honest-fix" } })).r.exit).toBe(2);
    expect(existsSync(path.join(h, "ledger.jsonl"))).toBe(false);
  });

  it("E_PROXY_DOWN при claude без прокси; E_BASE_NOT_FOUND", async () => {
    const h = home();
    expect((await go({ h, docker: new FakeDocker(), i: { agent: "claude" } })).r.error?.code).toBe("E_PROXY_DOWN");
    const other = path.join(h, "other.json");
    const c = JSON.parse(readFileSync(CONTRACT, "utf8")) as Record<string, unknown>;
    c.base_commit = "1".repeat(40);
    delete c.contract_hash;
    const { sealContract } = await import("@mandat/contract");
    writeFileSync(other, JSON.stringify(sealContract(c as Parameters<typeof sealContract>[0])));
    expect((await go({ h, docker: new FakeDocker(), i: { contractPath: other } })).r.error?.code).toBe("E_BASE_NOT_FOUND");
  });

  it("lock: жив pid → 2; мъртъв pid → взема се", async () => {
    const h = home();
    writeFileSync(path.join(h, "run.lock"), String(process.ppid));
    expect((await go({ h, docker: new FakeDocker() })).r.exit).toBe(2);
    writeFileSync(path.join(h, "run.lock"), "999999");
    expect((await go({ h, docker: new FakeDocker({ head: honest }) })).r.exit).toBe(0);
    expect(existsSync(path.join(h, "run.lock"))).toBe(false);
  });

  it("ANTHROPIC_API_KEY се маха; тайни не са в argv (D-008, D-043)", async () => {
    const key = ["sk", "ant", "api03", randomBytes(30).toString("base64url")].join("-");
    process.env.ANTHROPIC_API_KEY = key;
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const d = new FakeDocker({ head: honest });
    let canary = "";
    const { r } = await go({ docker: d, i: { hooks: { onCanary: (v) => (canary = v) } } });
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(err.mock.calls.map((c) => String(c[0])).join("")).toContain("ANTHROPIC_API_KEY removed from mandat run env (D-008)");
    const all = d.calls.map((c) => c.args.join(" ") + JSON.stringify(c.env)).join("\n");
    expect(all).not.toContain(key);
    const argv = d.calls.map((c) => c.args.join(" ")).join("\n");
    expect(argv).not.toContain(canary);
    expect(argv).not.toContain(d.token);
    const agentCall = d.calls.find((c) => c.args.includes("/opt/mandat/fakes/honest-fix.mjs"));
    expect(agentCall?.env.ANTHROPIC_API_KEY?.startsWith("mdt_")).toBe(true);
    expect(agentCall?.env.AWS_SECRET_ACCESS_KEY).toBe(canary);
    expect(agentCall?.args).toContain("ANTHROPIC_API_KEY");
    expect(r.verdict?.result).toBe("VERIFIED");
  });

  it("agent-exit.json (D-110)", async () => {
    const { r } = await go({ docker: new FakeDocker({ agentExit: 3, head: honest }) });
    expect(JSON.parse(readFileSync(path.join(r.runDir ?? "", "agent-exit.json"), "utf8"))).toEqual({ exit: 3, timedOut: false });
    expect(r.agentExit).toBe(3);
    expect(r.verdict?.result).toBe("VERIFIED");
  });

  it("apply_failed (D-126) → INTEGRITY unknown, D1–MUST_PASS n/a", async () => {
    const { r, events } = await go({ docker: new FakeDocker({ head: honest }), x: { recompute: () => Promise.resolve({ error: "apply_failed" as const }) } });
    expect(det(r, "INTEGRITY")?.signature).toBe("INTEGRITY:apply_failed:-");
    expect(r.verdict?.integrity).toBe("mismatch");
    expect(events.filter((e) => e.kind === "tree_mismatch")).toHaveLength(1);
    for (const d of ["D1.base_tests", "D2.inventory", "D3.protected", "D4.contract", "MUST_PASS"]) expect(det(r, d)?.status).toBe("n/a");
    expect(r.verdict?.result).toBe("UNKNOWN");
  });

  it("ExportRejection формат (D-063) и redact → hash → write (D-075)", async () => {
    // a random segment the entropy rule surely flags (a random draw can fall under the threshold: the test was flaky)
    const draw = () => Array.from(randomBytes(40), (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[b % 62]).join("");
    let seg = draw();
    while (createRedactor({ exactSecrets: [] }).redactText(`src/${seg}`).text !== "src/[REDACTED:entropy]") seg = draw();
    const head = () => shopCopy((d) => symlinkSync("/etc/passwd", path.join(d, "src", seg)));
    const { r, h } = await go({ docker: new FakeDocker({ head }) });
    const dir = r.runDir ?? "";
    const v = Verdict.parse(JSON.parse(readFileSync(path.join(dir, "verdict.json"), "utf8")));
    expect(Object.keys(v.timings_ms).sort()).toEqual(["agent", "export", "install", "provision", "total", "verdict", "verify"]);
    expect(v.timings_ms.verify).toBe(0);
    expect(v.reasons[0]).toBe("export:symlink");
    expect(existsSync(path.join(dir, "export", "changeset.json"))).toBe(false);
    const ledger = readFileSync(path.join(h, "ledger.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { seq: number; payload_hash: string });
    const rows = readFileSync(path.join(dir, "ledger-payloads.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { seq: number; payload: { verdict_hash?: string } });
    for (const row of rows) expect(hashJcs(row.payload)).toBe(ledger.find((l) => l.seq === row.seq)?.payload_hash);
    expect(hashJcs(JSON.parse(readFileSync(path.join(dir, "verdict.json"), "utf8")))).toBe(rows.at(-1)?.payload.verdict_hash);
    for (const f of ["verdict.json", "ledger-payloads.jsonl"]) {
      const t = readFileSync(path.join(dir, f), "utf8");
      expect(t).not.toContain(seg);
      expect(t).toContain("src/[REDACTED:entropy]");
    }
  });

  it("CANARY пази diff.patch (D-031); честен диф е байт-по-байт", async () => {
    const leak = (c: { canary: string }) => shopCopy((d) => writeFileSync(path.join(d, "src/leak.ts"), `export const k = "${c.canary}";\n`));
    const { r, h } = await go({ docker: new FakeDocker({ head: leak }) });
    const dir = r.runDir ?? "";
    expect(existsSync(path.join(dir, "export", "diff.patch"))).toBe(false);
    expect(readFileSync(path.join(dir, "export", "diff.redacted.patch"), "utf8")).toContain("[REDACTED:exact]");
    for (const d of ["D1.base_tests", "D2.inventory", "D3.protected", "D4.contract", "MUST_PASS"]) expect(det(r, d)?.status).toBe("n/a");
    expect([r.verdict?.result, r.verdict?.reasons]).toEqual(["FAILED", ["CANARY:in_diff:-"]]);
    const canaryHash = (JSON.parse(readFileSync(path.join(dir, "canary.json"), "utf8")) as { value_hash: string }).value_hash;
    expect(canaryHash).toMatch(/^sha256:/);
    const bin = () => shopCopy((d) => writeFileSync(path.join(d, "src/logo.bin"), Buffer.concat([Buffer.from([0]), randomBytes(2000)])));
    const b = await go({ h, docker: new FakeDocker({ head: bin }) });
    const patch = readFileSync(path.join(b.r.runDir ?? "", "export", "diff.patch"));
    expect(patch.toString()).toContain("GIT binary patch");
    expect(patch.toString()).not.toContain("[REDACTED");
  });

  it("edge: canary само в notes (D-071)", async () => {
    const { r, events } = await go({ docker: new FakeDocker({ head: honest, notes: (c) => `leak ${c.canary}` }) });
    const dir = r.runDir ?? "";
    expect(existsSync(path.join(dir, "export", "diff.patch"))).toBe(true);
    expect(existsSync(path.join(dir, "export", "diff.redacted.patch"))).toBe(false);
    expect(r.verdict?.reasons).toContain("CANARY:in_notes:-");
    expect(r.verdict?.result).toBe("FAILED");
    expect(events.filter((e) => e.kind === "canary_hit")).toHaveLength(1);
    expect(readFileSync(path.join(dir, "notes.txt"), "utf8")).toBe("leak [REDACTED:exact]");
  });

  it("notes: безопасно четене (D-092)", async () => {
    const d = new FakeDocker({ head: honest, notesExit: 1 });
    await go({ docker: d });
    const c = d.calls.find((x) => x.args.join(" ").includes("head -c 1048576"));
    const a = c?.args.join(" ") ?? "";
    for (const s of ["test -f", "! test -L", "head -c 1048576", "--network none", "mandat.role=export"]) expect(a).toContain(s);
    const t = await go({ docker: new FakeDocker({ head: honest, notesTimedOut: true }) });
    expect(t.r.verdict?.result).toBe("VERIFIED");
  });

  it("INTEGRITY post_verify заменя (D-074)", async () => {
    const extra = "diff --git a/src/x.ts b/src/x.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/x.ts\n@@ -0,0 +1 @@\n+export const t = 1;\n";
    const { r, events, ledgerLines } = await go({ docker: new FakeDocker({ head: honest }), i: { hooks: { beforeVerdict: (dir) => Promise.resolve(appendFileSync(path.join(dir, "export", "diff.patch"), extra)) } } });
    const ints = r.verdict?.evidence.filter((e) => e.detector === "INTEGRITY") ?? [];
    expect(ints).toHaveLength(1);
    expect([ints[0]?.status, ints[0]?.signature]).toEqual(["unknown", "INTEGRITY:mismatch:post_verify"]);
    expect(r.verdict?.integrity).toBe("mismatch");
    expect(events.filter((e) => e.kind === "tree_mismatch" && e.severity === "incident")).toHaveLength(1);
    expect(ledgerLines.filter((l) => l.includes('"security_event"'))).toHaveLength(1);
    expect(r.verdict?.result).toBe("UNKNOWN");
  });

  it("baseline кеш (D-097)", async () => {
    const h = home();
    const a = await go({ h, docker: new FakeDocker({ head: honest }) });
    expect(a.testsCalls.filter((t) => t.tree === "base")).toHaveLength(1);
    const cacheDir = path.join(h, "cache", "baseline");
    const file = path.join(cacheDir, (await import("node:fs")).readdirSync(cacheDir)[0] ?? "");
    expect(readFileSync(file, "utf8")).toBe(BASE_RAW);
    const b = await go({ h, docker: new FakeDocker({ head: honest }) });
    expect(b.testsCalls.filter((t) => t.tree === "base")).toHaveLength(0);
    writeFileSync(file, "{");
    const c = await go({ h, docker: new FakeDocker({ head: honest }) });
    expect(c.testsCalls.filter((t) => t.tree === "base")).toHaveLength(1);
    expect(readFileSync(file, "utf8")).toBe(BASE_RAW);
  });

  it("edge: отчетът липсва / дублирано ID → D2 report_invalid", async () => {
    const miss = await go({ docker: new FakeDocker({ head: honest }), tests: (i) => (i.tree === "b" ? { ok: true, exit: 0, timedOut: false, raw: null, report: parseVitestReport(null, "/m/work") } : ok(i.tree === "base" ? BASE_RAW : ALL_PASS_RAW)) });
    expect(miss.r.verdict?.reasons).toContain("D2:report_invalid:missing");
    expect(miss.r.verdict?.result).toBe("FAILED");
    const dup = JSON.parse(ALL_PASS_RAW) as { testResults: { assertionResults: unknown[] }[] };
    dup.testResults[0]?.assertionResults.push(dup.testResults[0].assertionResults[0]);
    const d = await go({ docker: new FakeDocker({ head: honest }), tests: (i) => (i.tree === "b" ? ok(JSON.stringify(dup)) : ok(i.tree === "base" ? BASE_RAW : ALL_PASS_RAW)) });
    expect(d.r.verdict?.reasons).toContain("D2:report_invalid:duplicate_id");
  });

  it("edge: проксито пада → износът продължава, без infra", async () => {
    const lines = () => [
      '{"type":"system","subtype":"init","session_id":"s","model":"m","tools":[],"mcp_servers":[]}',
      ...[1, 2, 3].map((n) => `{"type":"system","subtype":"api_retry","attempt":${n},"error_status":502,"error":"bad gateway"}`),
      '{"type":"result","subtype":"error","is_error":true,"total_cost_usd":0,"num_turns":0}',
    ];
    const { r } = await go({ docker: new FakeDocker({ head: honest, agentLines: lines, agentExit: 1 }) });
    expect(r.verdict?.reasons.some((x) => x.startsWith("infra:"))).toBe(false);
    expect(r.verdict?.tree_sha).not.toBeNull();
  });

  it("transcript формат (D-062)", async () => {
    const lines = (c: { token: string }) => [JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: `key ${c.token}` }] } }), "plain text"];
    const { r } = await go({ docker: new FakeDocker({ head: honest, agentLines: lines }) });
    const t = readFileSync(path.join(r.runDir ?? "", "transcript.jsonl"), "utf8").trim().split("\n");
    expect(JSON.parse(t[0] ?? "")).toEqual({ type: "assistant", message: { content: [{ type: "text", text: "key [REDACTED:exact]" }] } });
    expect(JSON.parse(t[1] ?? "")).toEqual({ raw: "plain text" });
  });

  it("usage poll грешки (D-049) и fake токен", async () => {
    const h = home();
    mkdirSync(path.join(h, "proxy"), { recursive: true });
    writeFileSync(path.join(h, "proxy", "secret"), randomBytes(32));
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const channel: Channel = {
      label: "anthropic-key-main", kind: "api_key", provider: "anthropic", model: "claude-sonnet-5-5",
      issueTaskCredential: () => Promise.resolve({ token: `mdt_${"a".repeat(30)}.${"b".repeat(43)}`, tokenHash: "sha256:x", expiresAt: "" }),
      revokeTaskCredential: () => Promise.resolve(),
      usage: () => Promise.reject(new Error("down")),
      sandboxEnv: (c) => ({ ANTHROPIC_BASE_URL: "http://egress-gate", ANTHROPIC_API_KEY: c.token }),
      gateRoutes: () => [],
    };
    const slow: DockerRunner = new FakeDocker({ head: honest });
    const orig = slow.run.bind(slow);
    slow.run = async (args, o) => {
      if (args.some((a) => a.startsWith("/opt/mandat/fakes/"))) await new Promise((r) => setTimeout(r, 120));
      return orig(args, o);
    };
    const { r } = await go({ h, docker: slow, x: { channel, healthz: () => Promise.resolve(true), usagePollMs: 10 } });
    const warnings = err.mock.calls.map((c) => String(c[0])).filter((s) => s.includes("usage poll failed"));
    expect(warnings).toHaveLength(1);
    expect(r.verdict?.usage).toEqual({ usd: 0, input_tokens: 0, output_tokens: 0, requests: 0 });
    const fake = new FakeDocker({ head: honest });
    await go({ docker: fake });
    expect(fake.token).toMatch(/^mdt_[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{43}$/);
  });

  it("gate policy handshake (D-044): без policy_loaded → E_GATE_POLICY", async () => {
    const h = home();
    const runDir = path.join(h, "runs", "r_01JB8Z3K4M5N6P7Q8R9S0T1V2W");
    const docker: DockerRunner = {
      run: (args, o) => {
        if (args[0] === "inspect") o.onStdout?.(Buffer.from("172.30.0.2\n"));
        return Promise.resolve({ exitCode: 0, timedOut: false });
      },
    };
    await expect(
      startRunGate({ docker, runId: "r_01JB8Z3K4M5N6P7Q8R9S0T1V2W", runDir, mandatHome: h, home: os.homedir(), tree: "agent", gateImage: IMAGES.gate, user: "1000:1000", extraCa: undefined, sleep: () => Promise.resolve() }, { phase: "install", routes: [] }),
    ).rejects.toMatchObject({ code: "E_GATE_POLICY" });
    const viaRun = await go({ docker: new FakeDocker({ head: honest }), x: { startGate: () => Promise.reject(Object.assign(new Error("x"), { code: "E_GATE_POLICY" })) } });
    expect(viaRun.r.verdict?.reasons).toEqual(["infra:gate_policy", "INFRA:GATE_POLICY:-"]);
  });

  it("tar поток с отказ при unreadable", async () => {
    const { r } = await go({ docker: new FakeDocker({ head: () => shopCopy(), tarExit: 2, tarStderr: "tar: ./src/x.ts: Cannot open: Permission denied\n" }) });
    expect(r.verdict?.reasons).toEqual(["export:unreadable", "EXPORT:unreadable:src/x.ts"]);

  });
});
