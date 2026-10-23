import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DockerRunner } from "@mandat/sandbox";
import type { RunGate } from "./gate.js";
import { runTestProcedure } from "./test-procedure.js";
import type { TestProcedureInput } from "./test-procedure.js";

// E0 т. 7.8(4) with a scripted docker CLI: seed → gate (install) → npm ci → tests (--network none) → report.
const LOCK = { name: "shop", lockfileVersion: 3, packages: { "": { name: "shop" } } };
function tree(lock: unknown = LOCK): string {
  const d = mkdtempSync(path.join(os.tmpdir(), "mandat-tp-"));
  writeFileSync(path.join(d, "package.json"), "{}");
  if (lock !== undefined) writeFileSync(path.join(d, "package-lock.json"), typeof lock === "string" ? lock : JSON.stringify(lock));
  return d;
}
type Step = { match: (a: string[]) => boolean; exit?: number; out?: string; timedOut?: boolean };
function docker(steps: Step[], calls: string[][]): DockerRunner {
  return {
    run(args, o) {
      calls.push(args);
      const s = steps.find((x) => x.match(args));
      if (s?.out) o.onStdout?.(Buffer.from(s.out));
      const stdin = o.stdin;
      if (stdin !== "closed") stdin.resume();
      return Promise.resolve({ exitCode: s?.exit ?? 0, timedOut: s?.timedOut ?? false });
    },
  };
}
const gate = (stops: string[]): RunGate => ({ ip: "10.0.0.2", net: "mandat-net-x", name: "g", paths: {} as RunGate["paths"], setPolicy: () => Promise.resolve(), stop: () => Promise.resolve(void stops.push("stop")) });
const report = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../fixtures/vitest-reports/base-1fail.json"), "utf8");
const input = (d: DockerRunner, treeDir: string, over: Partial<TestProcedureInput> = {}): TestProcedureInput => {
  const mandatHome = mkdtempSync(path.join(os.tmpdir(), "mandat-tph-"));
  return {
  docker: d, runId: "r_01JABCDEFGHJKMNPQRSTVWXYZ0", runDir: path.join(mandatHome, "runs", "r_01JABCDEFGHJKMNPQRSTVWXYZ0"), mandatHome, home: os.homedir(), tree: "a", treeDir,
  testsCommand: "npx vitest run", testsEnv: {}, images: { sandbox: "s:t", gate: "g:t" }, timeoutMs: 1000, ...over,
  };
};
const isCmd = (cmd: string) => (a: string[]) => a.includes(cmd);

describe("runTestProcedure (фалшив docker)", () => {
  it("щастлив път: seed → gate → npm ci → тестове без мрежа → отчет; gate и volume се чистят", async () => {
    const calls: string[][] = [];
    const stops: string[] = [];
    const d = docker([{ match: (a) => a.join(" ").includes("head -c"), out: report }, { match: (a) => a.join(" ").includes("/bin/sh -c npx vitest run"), exit: 1 }], calls);
    const r = await runTestProcedure({ ...input(d, tree()), startGate: () => Promise.resolve(gate(stops)) });
    expect(r).toMatchObject({ ok: true, exit: 1, timedOut: false });
    if (r.ok) expect(r.report).toMatchObject({ valid: true, total: 20 });
    const testCall = calls.find((a) => a.join(" ").includes("npx vitest run")) ?? [];
    expect(testCall.join(" ")).toContain("--network none");
    expect(stops.length).toBeGreaterThanOrEqual(1);
    expect(calls.at(-1)?.slice(0, 3)).toEqual(["volume", "rm", "-f"]);
  });
  it("лош lockfile → E_LOCKFILE_BASE (base) / E_INSTALL_TREE (A, B)", async () => {
    const d = docker([], []);
    expect(await runTestProcedure({ ...input(d, tree("{bad"), { tree: "base" }) })).toEqual({ ok: false, code: "E_LOCKFILE_BASE" });
    expect(await runTestProcedure({ ...input(d, tree({ lockfileVersion: 1 }), { tree: "b" }) })).toEqual({ ok: false, code: "E_INSTALL_TREE" });
  });
  it("seed / gate / npm ci падат; timeout на тестовете", async () => {
    const stops: string[] = [];
    const g = () => Promise.resolve(gate(stops));
    expect(await runTestProcedure({ ...input(docker([{ match: isCmd("-x"), exit: 2 }], []), tree(), { tree: "base" }), startGate: g })).toEqual({ ok: false, code: "E_INSTALL_BASE" });
    expect(await runTestProcedure({ ...input(docker([], []), tree()), startGate: () => Promise.reject(Object.assign(new Error("p"), { code: "E_GATE_POLICY" })) })).toEqual({ ok: false, code: "E_GATE_POLICY" });
    expect(await runTestProcedure({ ...input(docker([], []), tree()), startGate: () => Promise.reject(new Error("x")) })).toEqual({ ok: false, code: "E_GATE_START" });
    expect(await runTestProcedure({ ...input(docker([{ match: isCmd("ci"), exit: 1 }], []), tree()), startGate: g })).toEqual({ ok: false, code: "E_INSTALL_TREE" });
    const t = await runTestProcedure({ ...input(docker([{ match: (a) => a.join(" ").includes("npx vitest run"), timedOut: true, exit: 137 }], []), tree()), startGate: g });
    expect(t).toMatchObject({ ok: true, exit: null, timedOut: true });
  });
  it("D-300: мутантите вървят на същия volume след тестовете: запис → тестове (старият отчет се трие) → връщане; seed пада → null", async () => {
    const calls: string[][] = [];
    const stops: string[] = [];
    const d = docker([{ match: (a) => a.join(" ").includes("head -c"), out: report }], calls);
    const mutants = [{ path: "src/cart.ts", mutated: Buffer.from("m1"), original: Buffer.from("o1") }, { path: "src/x.ts", mutated: Buffer.from("m2"), original: Buffer.from("o2") }];
    const r = await runTestProcedure({ ...input(d, tree()), startGate: () => Promise.resolve(gate(stops)), mutants, mutantTimeoutMs: 500 });
    expect(r.ok && r.mutants?.length).toBe(2);
    if (r.ok) expect(r.mutants?.every((m) => m?.report.valid)).toBe(true);
    const mutantRuns = calls.filter((a) => a.join(" ").includes("rm -f /m/out/report.json; npx vitest run"));
    expect(mutantRuns).toHaveLength(2);
    for (const a of mutantRuns) expect(a.join(" ")).toContain("--network none");
    // seed of the 1st mutant fails → null for every mutant, no test run
    let seeds = 0;
    const bad: DockerRunner = { run: (args, o) => { const st = o.stdin; if (st !== "closed") st.resume(); const isSeed = args.includes("-x"); if (isSeed) seeds++; return Promise.resolve({ exitCode: isSeed && seeds > 1 ? 1 : 0, timedOut: false }); } };
    const r2 = await runTestProcedure({ ...input(bad, tree()), startGate: () => Promise.resolve(gate(stops)), mutants: mutants.slice(0, 1) });
    expect(r2.ok && r2.mutants).toEqual([null]);
  });
  it("D-301: pnpm без pnpm-lock.yaml → E_INSTALL_TREE; с lockfile → pnpm install през gate", async () => {
    expect(await runTestProcedure({ ...input(docker([], []), tree(), { packageManager: "pnpm" }) })).toEqual({ ok: false, code: "E_INSTALL_TREE" });
    const d = tree(undefined);
    writeFileSync(path.join(d, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\nimporters:\n  .: {}\npackages: {}\n");
    const calls: string[][] = [];
    const r = await runTestProcedure({ ...input(docker([{ match: (a) => a.join(" ").includes("head -c"), out: report }], calls), d, { packageManager: "pnpm" }), startGate: () => Promise.resolve(gate([])) });
    expect(r.ok).toBe(true);
    expect(calls.some((a) => a.includes("pnpm") && a.includes("--frozen-lockfile"))).toBe(true);
  });

  it("E9б (D8): lint and typecheck run after the tests on the same installed volume, with no network; their exits come back", async () => {
    const calls: string[][] = [];
    const d = docker([{ match: (a) => a.join(" ").includes("head -c"), out: report }, { match: (a) => a.join(" ").includes("/bin/sh -c npm run lint"), exit: 1 }, { match: (a) => a.join(" ").includes("/bin/sh -c npx tsc --noEmit"), timedOut: true }], calls);
    const r = await runTestProcedure({ ...input(d, tree()), startGate: () => Promise.resolve(gate([])), checks: [{ name: "lint", command: "npm run lint" }, { name: "typecheck", command: "npx tsc --noEmit" }] });
    expect(r.ok && r.checks).toEqual([{ name: "lint", exit: 1 }, { name: "typecheck", exit: null }]);
    const lint = calls.find((a) => a.join(" ").includes("npm run lint")) ?? [];
    expect(lint.join(" ")).toContain("--network none");
  });
  it("E9б (D12): last, tree B's dev server and a browser on the run's own internal network; the result and screenshots come back; all of it is removed", async () => {
    const calls: string[][] = [];
    const run = "r_01JABCDEFGHJKMNPQRSTVWXYZ0";
    const result = JSON.stringify({ up: true, routes: [{ route: "/", console_errors: ["boom"], failed_requests: [], screenshot: "route-0.png" }, { route: "/cart", console_errors: [], failed_requests: [], screenshot: "route-1.png" }] });
    const d = docker([
      { match: (a) => a.join(" ").includes("/m/out/ui/result.json"), out: result },
      { match: (a) => a.join(" ").includes("/m/out/ui/route-0.png"), out: "PNG0" },
      { match: (a) => a.join(" ").includes("/m/out/ui/route-1.png"), exit: 1 },
      { match: (a) => a.join(" ").includes("head -c"), out: report },
    ], calls);
    const r = await runTestProcedure({ ...input(d, tree(), { tree: "b" }), startGate: () => Promise.resolve(gate([])), ui: { image: "ui:t", devCommand: "npm run dev", routes: ["/", "/cart"] } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ui?.up).toBe(true);
    expect(r.ui?.routes.map((x) => x.route)).toEqual(["/", "/cart"]);
    expect(r.ui?.routes[0]?.console_errors).toEqual(["boom"]);
    expect(r.ui?.shots["route-0.png"]?.toString()).toBe("PNG0");
    expect(r.ui?.shots["route-1.png"]).toBeUndefined();
    const j = calls.map((a) => a.join(" "));
    expect(j).toContain(`network create --internal --label mandat.run=${run} mandat-ui-${run}`);
    const app = j.find((a) => a.includes("mandat.role=ui-app")) ?? "";
    expect(app).toMatch(/^run -d /);
    expect(app).toContain(`--name mandat-ui-app-${run}`);
    expect(app).toContain(`--network mandat-ui-${run}`);
    expect(app).toContain(`mandat-vol-${run}-b:/m`);
    expect(app).toContain("-e PORT=4173");
    expect(app).toContain("-e HOST=0.0.0.0");
    expect(app.endsWith("s:t /bin/sh -c npm run dev")).toBe(true);
    const ui = j.find((a) => a.includes("mandat.role=ui ")) ?? "";
    expect(ui).toContain(`--network mandat-ui-${run}`);
    expect(ui).toContain(`-e MANDAT_UI_URL=http://mandat-ui-app-${run}:4173`);
    expect(ui).toContain('-e MANDAT_UI_ROUTES=["/","/cart"]');
    expect(ui).toContain(`mandat-uiout-${run}:/m`);
    expect(ui).not.toContain(`mandat-vol-${run}-b`);
    expect(ui.endsWith("ui:t node /opt/mandat/ui/ui-run.mjs")).toBe(true);
    for (const a of [...j.filter((x) => x.includes("mandat.role")), ...j]) expect(a).not.toMatch(/ -p |--publish|--privileged|--cap-add/);
    // the UI step is the last thing on the volume; then the app, the network and the out volume go
    expect(j.indexOf(app)).toBeGreaterThan(j.findIndex((a) => a.includes("/bin/sh -c npx vitest run")));
    expect(j).toContain(`rm -f mandat-ui-app-${run}`);
    expect(j).toContain(`network rm mandat-ui-${run}`);
    expect(j).toContain(`volume rm -f mandat-uiout-${run}`);
  });
  it("E9б (D12): a broken result.json or a network that cannot be made → ui null (D12 says the check did not run); the verdict path goes on", async () => {
    const d1 = docker([{ match: (a) => a.join(" ").includes("/m/out/ui/result.json"), out: "{not json" }, { match: (a) => a.join(" ").includes("head -c"), out: report }], []);
    const r1 = await runTestProcedure({ ...input(d1, tree(), { tree: "b" }), startGate: () => Promise.resolve(gate([])), ui: { image: "ui:t", devCommand: "npm run dev", routes: ["/"] } });
    expect(r1.ok && r1.ui).toBeNull();
    const d2 = docker([{ match: (a) => a[0] === "network" && a[1] === "create", exit: 1 }, { match: (a) => a.join(" ").includes("head -c"), out: report }], []);
    const r2 = await runTestProcedure({ ...input(d2, tree(), { tree: "b" }), startGate: () => Promise.resolve(gate([])), ui: { image: "ui:t", devCommand: "npm run dev", routes: ["/"] } });
    expect(r2).toMatchObject({ ok: true, ui: null });
  });
});
