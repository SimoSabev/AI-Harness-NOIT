import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { okDocker, simRunTests } from "../../verify/src/shop-sim.test-helper.js";
import { M, deleteM, demoRepoWithPull, editFile } from "./demo-repo.js";
import { externalPrVerdict } from "./external.js";
import type { ExternalPrInput } from "./external.js";
import { OBSERVER_APP_ID, WRITER_APP_ID, fakeGitHub } from "./fake.js";
import type { CheckRunInput } from "./port.js";

// т. 6.4 without Docker (tests simulated by shop-sim, D-272); the real sandbox path is external-pr.docker.test.ts.
const REPO = "mandat-demo/shop";
function setup(edit: (w: string) => void, pull: Record<string, unknown> = {}) {
  const g = demoRepoWithPull(edit);
  const gh = fakeGitHub({ repos: { [REPO]: { gitPath: g.bare, head: g.base } }, pulls: [{ repo: REPO, pull: { number: 1, head_sha: g.head, base_sha: g.base, head_ref: "octo/fix", author_id: 4242, author_association: "COLLABORATOR", ...pull } }] });
  gh.addCheck(REPO, { name: "test", head_sha: g.head, external_id: "ci", conclusion: "success", app_id: 15368, title: "ci", summary: "" });
  const posted: CheckRunInput[] = [];
  const sec: string[] = [];
  const input = (over: Partial<ExternalPrInput> = {}): ExternalPrInput => ({
    gh, repo: REPO, number: 1, remoteUrl: `file://${g.bare}`, defaultBranch: "main", writerAppId: WRITER_APP_ID, ownAppIds: [WRITER_APP_ID, OBSERVER_APP_ID], known: [],
    queue: { activeGlobal: 0, activeForPull: 0, startedLastHourForRepo: 0 },
    verify: { docker: okDocker, images: { sandbox: "s", gate: "g", proxy: "p" }, infraUser: "1:1", ipv6Sysctl: true, mandatHome: mkdtempSync(path.join(os.tmpdir(), "mandat-ext-u-")), home: os.homedir(), runTests: simRunTests() },
    postCheck: async (repo, c) => {
      posted.push(c);
      await gh.createOrUpdateCheckRun(repo, c);
    },
    security: (k) => void sec.push(k),
    ...over,
  });
  return { g, gh, posted, sec, input };
}

describe("external-pr (без Docker)", () => {
  it("изтрит тест M + зелен CI → failure; D7.ci pass · D2.inventory fail (20 → 19); ниво ≤ 1; без merge/ready", async () => {
    const s = setup((w) => editFile(w, "tests/cart.spec.ts", deleteM));
    const r = await externalPrVerdict(s.input());
    expect(r.kind).toBe("verdict");
    if (r.kind !== "verdict") return;
    expect(r.check).toMatchObject({ conclusion: "failure", external_id: `ext:${REPO}#1@${s.g.head.slice(0, 12)}` });
    expect(r.check.summary).toMatch(/\| D7\.ci \| pass \|/);
    expect(r.check.summary).toContain(`D2:missing_test:${M}`);
    expect(r.outcome.effective_level).toBeLessThanOrEqual(1);
    expect(r.outcome.verdict.agent).toBe("external:gh:4242");
    const d2 = r.outcome.verdict.evidence.find((e) => e.detector === "D2.inventory");
    expect(d2?.data).toMatchObject({ before: 20, after: 19 });
    expect(s.gh.state.calls.filter((c) => /^(merge|ready|createPull|createRef|humanMerge)/.test(c))).toEqual([]);
  });
  it("честна поправка → success, ниво 1 (external cap)", async () => {
    const s = setup((w) => editFile(w, "src/cart.ts", (x) => x.replace("= 50000;", "= 5000;")));
    const r = await externalPrVerdict(s.input());
    expect(r.kind === "verdict" && r.check.conclusion).toBe("success");
    expect(r.kind === "verdict" && r.outcome.effective_level).toBe(1);
  });
  it("PR към dev → base_not_protected без проверка; автор NONE → чака одобрение; mandat/* от друг → spoof", async () => {
    const a = setup((w) => editFile(w, "src/cart.ts", (x) => x + "\n"), { base_ref: "dev" });
    expect(await externalPrVerdict(a.input())).toMatchObject({ kind: "check_only", reason: "base_not_protected", check: { conclusion: "action_required", title: "UNKNOWN: POLICY:base_not_protected" } });
    const b = setup((w) => editFile(w, "src/cart.ts", (x) => x + "\n"), { author_association: "NONE", head_ref: "mandat/t_x-a1" });
    expect(await externalPrVerdict(b.input())).toMatchObject({ kind: "check_only", reason: "needs_approval" });
    expect(b.sec).toEqual(["branch_namespace_spoof"]);
  });
  it("наш PR (Writer + известен head) → ours; head се мести → retry; лош remote → base_untrusted", async () => {
    const s = setup((w) => editFile(w, "src/cart.ts", (x) => x + "\n"), { author_app_id: WRITER_APP_ID, head_ref: "mandat/t_demo-a1" });
    expect(await externalPrVerdict(s.input({ known: [{ head_sha: s.g.head, head_ref: "mandat/t_demo-a1" }] }))).toEqual({ kind: "ours" });
    const t = setup((w) => editFile(w, "src/cart.ts", (x) => x + "\n"));
    t.gh.pushToPull(REPO, 1, "9".repeat(40));
    expect(await externalPrVerdict(t.input())).toEqual({ kind: "retry", reason: "head_moved" });
    const u = setup((w) => editFile(w, "src/cart.ts", (x) => x + "\n"));
    expect(await externalPrVerdict(u.input({ remoteUrl: "/nonexistent.git" }))).toMatchObject({ kind: "check_only", reason: "base_untrusted" });
  });
});
