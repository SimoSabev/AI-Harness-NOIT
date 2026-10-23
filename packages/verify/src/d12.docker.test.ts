import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mandatVerify } from "./cli.js";
import { sh } from "./git-fixture.test-helper.js";

// v5 E9б (5.2, AC-5.5, D-364): D12 for real — tree B's dev server and Chromium (mandat-sandbox-ui, `mandat images build
// --ui`) on the run's own internal network; the routes, console errors and screenshots come back; nothing is published.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-d12-home-"));

function repo() {
  const root = mkdtempSync(path.join(os.tmpdir(), "mandat-d12-"));
  const seed = path.join(root, "seed");
  cpSync(path.join(repoRoot, "fixtures", "ui-app"), seed, { recursive: true });
  sh(seed, "init", "-q");
  sh(seed, "add", "-A");
  sh(seed, "commit", "-qm", "base");
  const remote = path.join(root, "ui.git");
  sh(root, "clone", "-q", "--bare", seed, remote);
  const r = path.join(root, "repo");
  sh(root, "clone", "-q", remote, r);
  sh(r, "checkout", "-q", "-b", "feat/total");
  return { root, remote, repo: r };
}
const edit = (r: string, f: string, fn: (s: string) => string) => writeFileSync(path.join(r, f), fn(readFileSync(path.join(r, f), "utf8")));
type Out = { verdict?: { run_id: string; result: string; reasons: string[]; evidence: { detector: string; status: string; data: { routes?: { route: string; console_errors: string[]; failed_requests: string[]; screenshot: string | null }[] } }[] } };

async function verify(f: { remote: string; repo: string }, routes: string[]) {
  let out = "";
  const io = { stdout: (s: string) => (out += s), stderr: () => undefined, env: process.env, cwd: f.repo };
  const code = await mandatVerify(["--repo", f.repo, "--remote", `file://${f.remote}`, "--home", home, "--json", "--external", "--type", "free", "--ui-paths", "web/**", "--dev", "node web/server.mjs", ...routes.flatMap((r) => ["--ui-route", r])], io, { repoRoot });
  const o = JSON.parse(out.trim().split("\n").at(-1) ?? "{}") as Out;
  if (process.env.MANDAT_DEBUG_D12) process.stderr.write(out + "\n");
  return { code, v: o.verdict, d12: o.verdict?.evidence.find((e) => e.detector === "D12.ui") };
}

describe("D12 UI (docker)", () => {
  it("a clean UI change → VERIFIED, D12 pass, the screenshot in the run directory; a script that throws and a missing route → UNKNOWN, never FAILED", async () => {
    const ok = repo();
    edit(ok.repo, "web/public/app.js", (s) => s.replace("Total: ", "Sum: "));
    const a = await verify(ok, ["/"]);
    expect([a.v?.result, a.d12?.status]).toEqual(["VERIFIED", "pass"]);
    const shot = path.join(home, "runs", a.v?.run_id ?? "", a.d12?.data.routes?.[0]?.screenshot ?? "-");
    expect(existsSync(shot)).toBe(true);
    expect(readFileSync(shot).subarray(1, 4).toString("latin1")).toBe("PNG");

    const bad = repo();
    edit(bad.repo, "web/public/app.js", (s) => `${s}\nthrow new Error("total broke");\n`);
    const b = await verify(bad, ["/", "/missing.html"]);
    expect([b.v?.result, b.d12?.status]).toEqual(["UNKNOWN", "unknown"]);
    expect(b.v?.reasons).toContain("D12:console_error:/");
    expect(b.d12?.data.routes?.[0]?.console_errors.join(" ")).toContain("total broke");
    expect(b.d12?.data.routes?.[1]?.failed_requests.join(" ")).toContain("404");
    rmSync(ok.root, { recursive: true, force: true });
    rmSync(bad.root, { recursive: true, force: true });
  }, 600_000);
});
