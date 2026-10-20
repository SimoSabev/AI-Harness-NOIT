import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { callTool, legacyHandshake, rpcClient } from "../../../scripts/mcp-call.mjs";

// т. 7.5 mcp-verify.docker: demo-shop (fix/discount) with a deleted test → mandat_verify → mandat_status → FAILED.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const main = path.join(repoRoot, "packages/mcp/dist/main.js");
const M = "tests/cart.spec.ts > cart > applies 10% over 50";
const git = (cwd: string, ...a: string[]) => execFileSync("git", ["-c", "init.defaultBranch=main", "-c", "user.name=t", "-c", "user.email=t@t.invalid", ...a], { cwd, encoding: "utf8" }).trim();
function shop() {
  const root = mkdtempSync(path.join(os.tmpdir(), "mandat-mcpd-"));
  const seed = path.join(root, "seed");
  cpSync(path.join(repoRoot, "fixtures/demo-shop"), seed, { recursive: true, filter: (s) => !s.includes("node_modules") });
  git(seed, "init", "-q");
  git(seed, "add", "-A");
  git(seed, "commit", "-qm", "base");
  git(root, "clone", "-q", "--bare", seed, path.join(root, "remote.git"));
  git(root, "clone", "-q", path.join(root, "remote.git"), path.join(root, "repo"));
  return root;
}
async function run(repo: string, remote: string, home: string, args: Record<string, unknown>) {
  const c = rpcClient("node", [main, "--same-uid", "--allow", repo, "--remote", `file://${remote}`, "--home", home], process.env as Record<string, string>);
  await legacyHandshake(c);
  const v = await callTool(c, "mandat_verify", args);
  const id = (v.value as { job_id: string }).job_id;
  let s = await callTool(c, "mandat_status", { job_id: id });
  for (let k = 0; k < 300 && (s.value as { status: string }).status === "running"; k++) {
    await new Promise((r) => setTimeout(r, 2000));
    s = await callTool(c, "mandat_status", { job_id: id });
  }
  const e = await callTool(c, "mandat_explain", { job_id: id });
  await c.close();
  return { status: s.value as { status: string; result: string; reasons: string[]; effective_level: number }, explain: (e.value as { text: string }).text };
}

describe("mcp mandat_verify (docker)", () => {
  it("изтрит тест → FAILED D2:missing_test:<M>, ниво ≤ 1, explain рамкира <M>; без task_type пак FAILED", async () => {
    const root = shop();
    const repo = path.join(root, "repo");
    git(repo, "checkout", "-q", "-b", "fix/discount");
    const f = path.join(repo, "tests/cart.spec.ts");
    writeFileSync(f, readFileSync(f, "utf8").replace(/ {2}it\("applies 10% over 50"[\s\S]*?\n {2}\}\);\n/, ""));
    const r = await run(repo, path.join(root, "remote.git"), path.join(root, "home"), {});
    expect(r.status).toMatchObject({ status: "done", result: "FAILED" });
    expect(r.status.reasons).toContain(`D2:missing_test:${M}`);
    expect(r.status.effective_level).toBeLessThanOrEqual(1);
    expect(r.explain).toContain("tests/cart.spec.ts &gt; cart &gt; applies 10% over 50</untrusted>");
  });
  it("на main → UNKNOWN POLICY:base_untrusted:on_default_branch", async () => {
    const root = shop();
    const repo = path.join(root, "repo");
    const f = path.join(repo, "src/cart.ts");
    writeFileSync(f, readFileSync(f, "utf8").replace("= 50000;", "= 5000;"));
    git(repo, "commit", "-qam", "fix on main");
    const r = await run(repo, path.join(root, "remote.git"), path.join(root, "home"), { task_type: "bugfix" });
    expect(r.status).toMatchObject({ result: "UNKNOWN" });
    expect(r.status.reasons).toContain("POLICY:base_untrusted:on_default_branch");
  });
});
